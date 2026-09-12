import { getJson } from '../api/http';
import { getStatusesBulk } from '../api/masterClient';
import type { OperationLog } from './operationLog';
import type { EnqueueResult, JobItem, JobStatus, OperationCounters, PackTarget } from './types';
import { emptyCounters } from './types';

/**
 * Kuyruk + izleme akışı.
 *
 * (1) Her hedef için sunucuda arka plan işi açılır ve jobId alınır.
 * (2) İşler bitene kadar durum sorulur; biten hedefin satırı yerinde "tamamlandı" olarak
 *     güncellenir, hatalı olan hatalı listesine taşınır.
 *
 * Böylece uzun süren migration'larda HTTP zaman aşımına düşülmez. Hem Dbt migration
 * (dbt-migrate-all-bg) hem EF migration (migrate-bg) için kullanılır.
 *
 * İki döngü (kuyruğa alma + izleme) eşzamanlı koşar ve aynı değişkenleri paylaşır. JavaScript tek
 * iş parçacıklı olduğu için kilide gerek yok: ikisi yalnız await noktalarında sıra değiştirir.
 */

/** Durum panelinde işlemin bittiğini gösteren aşama adı. */
export const FINISHED_PHASE = 'Tamamlandı';

/**
 * Kuyruğa alma sürerken izlemenin başlaması için gereken en az iş sayısı: ilk paketler koşmaya
 * başlamışken kuyruğa almanın bitmesini beklemek, tamamlananların dakikalarca görünmemesine
 * yol açıyordu.
 */
const MONITOR_START_THRESHOLD = 50;

/** Tek toplu durum isteğinde sorulacak jobId sayısı (sunucu tarafı sınırı 500). */
const STATUS_BATCH_SIZE = 200;

/** İzleme turları arasındaki bekleme. */
const MONITOR_ROUND_DELAY_MS = 3000;

/**
 * Akış kontrolü: bekleyen iş sayısı bu sınıra ulaştığında kuyruğa alma duraklar, işler bitip sayı
 * düşünce devam eder. Hangfire kuyruğunun binlerce işle şişmesini ve durdurmak istendiğinde geri
 * dönüşü olmayan bir yığın oluşmasını engeller. (İzleme eşiğinden büyük olmalı; aksi hâlde izleme
 * başlamadan kuyruğa alma kilitlenir.)
 */
const MAX_PENDING_JOBS = 200;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface QueuedOperationOptions {
    apiBaseUrl: string;
    log: OperationLog;
    operationName: string;
    headerText: string;
    targets: PackTarget[];
    buildEnqueueUrl: (target: PackTarget) => string;
    /** Yalnız YENİ İŞ KUYRUĞA ALMAYI durdurur; sunucuda koşan işler iptal edilmez. */
    signal: AbortSignal;
}

export async function runQueuedOperation(options: QueuedOperationOptions): Promise<void> {
    const { apiBaseUrl, log, operationName, headerText, targets, buildEnqueueUrl, signal } = options;

    const counters: OperationCounters = emptyCounters();
    const pending: JobItem[] = [];

    let isEnqueueDone = false;
    let isMonitorStarted = false;
    let isStopRequested = false;

    log.setCounters(counters);
    log.setStatus(`${operationName} - Başladı`, 'running');

    log.addLine('         *********************      ');
    log.addLine(`              Başladı - ${headerText}`);
    log.addLine('         *********************      ');

    function currentPhase(): string {
        if (isStopRequested && !isEnqueueDone) {
            return 'Durduruluyor';
        }

        if (!isEnqueueDone) {
            return isMonitorStarted ? 'Kuyruğa alınıyor + izleniyor' : 'Kuyruğa alınıyor';
        }

        return 'İzleniyor';
    }

    function updateOperation(phase: string): void {
        const skipped = counters.skipped > 0 ? ` | Atlanan: ${counters.skipped}` : '';

        log.setOperation(
            `${operationName} - ${phase} | Kuyruğa alınan: ${counters.queued}` +
                ` | Başarılı: ${counters.success} | Hatalı: ${counters.error}${skipped}` +
                ` | Bekleyen: ${pending.length}`,
        );

        counters.pending = pending.length;
        log.setCounters(counters);

        const isFinished = phase === FINISHED_PHASE;

        log.setStatus(
            `${operationName} - ${phase}`,
            !isFinished ? 'running' : counters.error > 0 ? 'failed' : 'succeeded',
        );
    }

    if (targets.length === 0) {
        log.addLine('         işlenecek veritabanı bulunamadı - Start kutusunu kontrol edin (0 = Dbt_Temp)');
        updateOperation(FINISHED_PHASE);
        log.flushNow();

        return;
    }

    function remove(item: JobItem): void {
        const index = pending.indexOf(item);

        if (index >= 0) {
            pending.splice(index, 1);
        }
    }

    /** Tek işin durumunu listeye/sayaçlara yazar; iş bittiyse bekleyenlerden düşer. */
    function applyStatus(item: JobItem, status: JobStatus): void {
        if (!status.isFound) {
            // Hangfire kaydı bulunamadı (silinmiş/temizlenmiş) — işin akıbeti bilinmiyor.
            remove(item);
            counters.error += 1;

            log.replaceLine(item.lineIndex, `${item.displayName} --> durum bulunamadı (jobId: ${item.jobId})`);
            log.addError(
                `${item.displayName} - durum bulunamadı (jobId: ${item.jobId}) -- Hangfire panelinden kontrol edin`,
            );

            updateOperation(currentPhase());

            return;
        }

        if (!status.isFinished) {
            log.replaceLine(item.lineIndex, `${item.displayName} --> ${status.state} | ${status.message ?? ''}`);

            return;
        }

        remove(item);

        if (status.isSucceeded && status.skippedCount > 0 && status.okCount === 0) {
            counters.skipped += 1;

            log.replaceLine(
                item.lineIndex,
                `${item.displayName} --> atlandı (migration uygulanacak veritabanı bulunamadı)`,
            );
        } else if (status.isSucceeded) {
            counters.success += 1;

            log.replaceLine(item.lineIndex, `${item.displayName} --> tamamlandı | ${status.message ?? ''}`);
        } else {
            counters.error += 1;

            const detail =
                status.failures && status.failures.length > 0 ? status.failures.join(' | ') : (status.error ?? '');

            log.replaceLine(item.lineIndex, `${item.displayName} --> HATALI | ${status.message ?? ''}`);
            log.addError(`${item.displayName} - ${status.state} -- ${status.message ?? ''} ${detail}`);
        }

        updateOperation(currentPhase());
    }

    // ----- kuyruğa alma döngüsü -----
    async function enqueueAll(): Promise<void> {
        for (const target of targets) {
            if (signal.aborted) {
                isStopRequested = true;

                log.addLine('         kuyruğa alma durduruldu - kuyrukta olan işler izlenmeye devam ediyor');

                break;
            }

            // Akış kontrolü: kuyrukta bekleyen iş sınırı aşıldıysa yeni iş atma, işler eritilsin.
            while (pending.length >= MAX_PENDING_JOBS && !signal.aborted) {
                updateOperation(`Kuyruk dolu (${pending.length}), bekleniyor`);

                await delay(1000);
            }

            const result = await getJson<EnqueueResult>(buildEnqueueUrl(target));

            const jobId = result.isSuccess ? (result.data?.jobId ?? '') : '';

            if (jobId) {
                counters.queued += 1;

                const lineIndex = log.addLine(`${target.displayName} --> kuyruğa alındı (jobId: ${jobId})`);

                pending.push({
                    packNo: target.packNo,
                    displayName: target.displayName,
                    jobId,
                    lineIndex,
                });
            } else {
                counters.error += 1;

                log.addLine(`${target.displayName} --> kuyruğa alınamadı`);
                log.addError(`${target.displayName} - ${result.error || `Status Code: ${result.status}`}`);
            }

            updateOperation(currentPhase());
        }

        isEnqueueDone = true;

        log.addLine(`         ${counters.queued} adet iş kuyruğa alındı, durum izleniyor...`);
    }

    // ----- izleme döngüsü -----
    async function monitor(): Promise<void> {
        // Kuyruğa alma bitmesini beklemeye gerek yok: eşik kadar iş kuyruğa girdiğinde (ya da
        // kuyruğa alma bittiğinde) izleme başlar, biten işler anında listeden ve sayaçlardan düşer.
        while (!isEnqueueDone && counters.queued < MONITOR_START_THRESHOLD) {
            await delay(500);
        }

        isMonitorStarted = true;

        while (!isEnqueueDone || pending.length > 0) {
            if (pending.length === 0) {
                await delay(500);

                continue;
            }

            const snapshot = [...pending];

            for (let i = 0; i < snapshot.length; i += STATUS_BATCH_SIZE) {
                const batch = snapshot.slice(i, i + STATUS_BATCH_SIZE);

                const statuses = await getStatusesBulk(
                    apiBaseUrl,
                    batch.map((d) => d.jobId),
                );

                if (statuses === null) {
                    // Geçici ağ/servis hatası: işler sunucuda koşmaya devam eder, sonraki turda tekrar sorulur.
                    continue;
                }

                const statusMap = new Map<string, JobStatus>();

                for (const status of statuses) {
                    if (status?.jobId && !statusMap.has(status.jobId)) {
                        statusMap.set(status.jobId, status);
                    }
                }

                for (const item of batch) {
                    const status = statusMap.get(item.jobId);

                    if (status) {
                        applyStatus(item, status);
                    }
                }

                updateOperation(currentPhase());
            }

            if (!isEnqueueDone || pending.length > 0) {
                await delay(MONITOR_ROUND_DELAY_MS);
            }
        }
    }

    await Promise.all([enqueueAll(), monitor()]);

    const skippedText = counters.skipped > 0 ? ` - Atlanan: ${counters.skipped}` : '';
    const stoppedText = isStopRequested ? ' (kuyruğa alma durduruldu)' : '';

    log.addLine('         *********************      ');
    log.addLine(
        `              Tamamlandı - Kuyruğa alınan: ${counters.queued} - Başarılı: ${counters.success}` +
            ` - Hatalı: ${counters.error}${skippedText}${stoppedText}`,
    );
    log.addLine('         *********************      ');
    log.addLine('         ');

    updateOperation(FINISHED_PHASE);
    log.flushNow();
}
