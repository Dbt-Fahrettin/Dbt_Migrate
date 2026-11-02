import { endpoints } from '../api/endpoints';
import { getJson } from '../api/http';
import { serviceKeyHeaders } from '../api/serviceKey';
import { formatDateTime } from '../format';
import type { OperationLog } from './operationLog';
import { emptyCounters } from './types';

export { formatDateTime };

/**
 * Salt okuma raporları: `7-Migration Geçmişi` ve `8-Migration Takip`.
 *
 * İkisi de her tenant veritabanındaki `public.__dbt_migrations_history` tablosunu okur —
 * Dbt migration'ların `__EFMigrationsHistory` karşılığı. Hiçbir şey yazmazlar, bu yüzden
 * Prod'da yazma onayı istenmez.
 */

/** `master/dbt-migration-history/{packNo}` yanıtındaki tek kayıt. */
export interface MigrationHistoryItem {
    migrationId?: string | null;
    firstAppliedAt?: string | null;
    lastAppliedAt?: string | null;
    isOk: boolean;
    runCount: number;
    failCount: number;
    durationMs: number;
    stepCount: number;
    stepFailCount: number;
    triggerKind?: string | null;
    appliedBy?: string | null;
    message?: string | null;
}

/** `master/dbt-migration-packs/{start}/{migrationId}` yanıtındaki tek paket durumu. */
export interface MigrationPackState {
    packNo?: string | null;
    migrationId?: string | null;
    isTracked: boolean;
    isApplied: boolean;
    isOk: boolean;
    lastAppliedAt?: string | null;
    runCount: number;
    failCount: number;
    triggerKind?: string | null;
    message?: string | null;
    error?: string | null;
}

export function formatDuration(durationMs: number): string {
    if (!durationMs || durationMs <= 0) {
        return '-';
    }

    return durationMs >= 1000 ? `${Math.round((durationMs / 1000) * 10) / 10} sn` : `${durationMs} ms`;
}

export function formatHistoryLine(item: MigrationHistoryItem): string {
    const steps = item.stepCount > 0 ? ` | adım: ${item.stepCount - item.stepFailCount}/${item.stepCount}` : '';
    const runs = item.runCount > 1 ? ` | koşu: ${item.runCount}` : '';
    const fails = item.failCount > 0 ? ` | hatalı koşu: ${item.failCount}` : '';
    const state = item.isOk ? 'OK' : 'HATA';
    const message = item.message?.trim() ? ` -> ${item.message}` : '';

    return (
        `${item.migrationId} --> ${state} | ${item.triggerKind} | ${formatDateTime(item.lastAppliedAt)}` +
        ` | ${formatDuration(item.durationMs)}${steps}${runs}${fails} | ${item.appliedBy}${message}`
    );
}

export function formatPackStateLine(state: MigrationPackState): string {
    const packName = state.packNo === 'Temp' ? 'Dbt_Temp' : `Dbt_${state.packNo}`;

    if (state.error?.trim()) {
        return `${packName} --> OKUNAMADI -> ${state.error}`;
    }

    if (!state.isTracked) {
        return `${packName} --> TAKİP YOK (MigrationHistoryInit koşturulmalı)`;
    }

    if (!state.isApplied) {
        return `${packName} --> UYGULANMADI`;
    }

    const runs = state.runCount > 1 ? ` | koşu: ${state.runCount}` : '';
    const message = state.message?.trim() ? ` -> ${state.message}` : '';
    const appliedAt = formatDateTime(state.lastAppliedAt);

    if (!state.isOk) {
        return (
            `${packName} --> HATALI | ${state.triggerKind} | ${appliedAt}${runs}` +
            ` | hatalı koşu: ${state.failCount}${message}`
        );
    }

    return `${packName} --> uygulandı | ${state.triggerKind} | ${appliedAt}${runs}`;
}

export interface ReportRequest {
    apiBaseUrl: string;
    log: OperationLog;
    operationName: string;
    startText: string;
    dbtMigrationName: string;
    onlyMissing: boolean;
    /** End kutusu: Migration Takip'te dolu ve ≥ Start ise paket ARALIĞI taranır. */
    endText?: string;
    signal?: AbortSignal;
}

/**
 * 7-Migration Geçmişi — tek paketin `__dbt_migrations_history` kayıtları.
 * Start kutusuna TAM paket numarası yazılır (0 = Dbt_Temp); End kullanılmaz.
 */
export async function runMigrationHistory(request: ReportRequest): Promise<void> {
    const { apiBaseUrl, log, operationName } = request;

    const packNo = request.startText.trim();
    const packName = packNo === '0' ? 'Dbt_Temp' : `Dbt_${packNo}`;
    const url = endpoints.migrationHistory(apiBaseUrl, packNo);

    const counters = emptyCounters();

    log.setOperation(`Migration Geçmişi - ${url}`);
    log.setStatus(`${operationName} - Başladı`, 'running');
    log.addLine(`${packName} - ${url}`);

    const result = await getJson<MigrationHistoryItem[]>(url, undefined, serviceKeyHeaders(apiBaseUrl));

    if (!result.isSuccess) {
        counters.error += 1;

        log.addLine(`${packName} --> geçmiş okunamadı`);
        log.addError(`${packName} - ${result.error || `Status Code: ${result.status}`}`);
    } else if (!Array.isArray(result.data) || result.data.length === 0) {
        log.addLine(`${packName} --> takip kaydı yok`);
        log.addLine("         Sebep: bu vt'de __dbt_migrations_history tablosu hiç oluşmamış olabilir.");
        log.addLine(
            '         Çözüm: 1-Dbt-Migrate ile MigrationHistoryInit koşturun (EF geçmişinden geriye dönük doldurur).',
        );
    } else {
        for (const item of result.data) {
            const line = formatHistoryLine(item);

            log.addLine(line);

            if (item.isOk) {
                counters.success += 1;
            } else {
                counters.error += 1;
                log.addError(`${packName} - ${line}`);
            }
        }
    }

    counters.queued = counters.success + counters.error;
    log.setCounters(counters);

    log.setOperation(
        `${operationName} - ${packName} | Kayıt: ${counters.queued}` +
            ` | Başarılı: ${counters.success} | Hatalı: ${counters.error}`,
    );

    log.setStatus(`${operationName} - Tamamlandı`, counters.error > 0 ? 'failed' : 'succeeded');
    log.flushNow();
}

/**
 * 8-Migration Takip — seçili Dbt migration'ın paket paket durumu.
 * Start kutusu paket ÖN EKİ olarak çalışır (sunucu `Dbt_{start}%` ile tarar, 0 = Dbt_Temp);
 * End kutusu bu işlemde kullanılmaz.
 */
export async function runMigrationTracking(request: ReportRequest): Promise<void> {
    const { apiBaseUrl, log, operationName } = request;

    // End kutusu doluysa Start..End aralığı taranır (gruplu özet); değilse eski ön ek taraması.
    const range = getTrackingRange(request.startText, request.endText);

    if (range) {
        await runRangeTracking({ ...request, start: range.start, end: range.end, appendOnly: false });

        return;
    }

    const packNoStarting = request.startText.trim();
    const migrationName = request.dbtMigrationName.trim();
    const url = endpoints.migrationPacks(apiBaseUrl, packNoStarting, migrationName, request.onlyMissing);

    const scope = packNoStarting === '0' ? 'Dbt_Temp' : `${packNoStarting} ile başlayan paketler`;

    const counters = emptyCounters();

    log.setOperation(`Migration Takip - ${url}`);
    log.setStatus(`${operationName} - Başladı`, 'running');
    log.addLine(`${scope} - ${migrationName}${request.onlyMissing ? ' (yalnız eksik/hatalı)' : ''}`);
    log.addLine('         paketler taranıyor, büyük aralıklarda birkaç dakika sürebilir...');
    log.flushNow();

    const result = await getJson<MigrationPackState[]>(url, undefined, serviceKeyHeaders(apiBaseUrl));

    if (!result.isSuccess) {
        counters.error += 1;

        log.addLine(`${migrationName} --> takip durumu okunamadı`);
        log.addError(`${scope} - ${migrationName} - ${result.error || `Status Code: ${result.status}`}`);
    } else if (!Array.isArray(result.data) || result.data.length === 0) {
        log.addLine(
            request.onlyMissing
                ? `${migrationName} --> eksik/hatalı paket bulunamadı (taranan aralıkta hepsi uygulanmış)`
                : `${migrationName} --> taranacak paket bulunamadı - Start kutusunu kontrol edin (0 = Dbt_Temp)`,
        );
    } else {
        for (const state of result.data) {
            const line = formatPackStateLine(state);

            log.addLine(line);

            if (state.isApplied && state.isOk) {
                counters.success += 1;
            } else {
                counters.error += 1;
                log.addError(line);
            }
        }
    }

    counters.queued = counters.success + counters.error;
    log.setCounters(counters);

    log.setOperation(
        `${operationName} - ${migrationName} | Paket: ${counters.queued}` +
            ` | Uygulanmış: ${counters.success} | Eksik/Hatalı: ${counters.error}`,
    );

    log.setStatus(`${operationName} - Tamamlandı`, counters.error > 0 ? 'failed' : 'succeeded');
    log.flushNow();
}

/**
 * Sunucu ucu eşzamanlı ve her paket için bir bağlantı açar; tarayıcı isteği 100 sn'de keser, bu yüzden
 * aralık 100'lük bloklara bölünüp sırayla sorulur.
 */
const TRACKING_CHUNK_SIZE = 100;

/**
 * Start..End aralığı: Start 6 haneli paket numarası ve End ≥ Start ise. 0 (Dbt_Temp) ve ön ek
 * kullanımı (End boş) aralık sayılmaz.
 */
export function getTrackingRange(startText: string, endText?: string): { start: number; end: number } | null {
    const start = Number.parseInt(startText.trim(), 10);
    const end = Number.parseInt((endText ?? '').trim(), 10);

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 100000 || end < start) {
        return null;
    }

    return { start, end };
}

/** Aralığı kapsayan 100'lük blok önekleri: 500000-500250 → 5000, 5001, 5002. */
export function trackingPrefixes(start: number, end: number): number[] {
    const prefixes: number[] = [];
    const last = Math.floor(end / TRACKING_CHUNK_SIZE);

    for (let prefix = Math.floor(start / TRACKING_CHUNK_SIZE); prefix <= last; prefix++) {
        prefixes.push(prefix);
    }

    return prefixes;
}

/** Paket numaralarını ardışık olanları birleştirerek yazar: 500000-500002, 500004. */
export function formatPackRanges(packNos: string[]): string {
    const names: string[] = [];
    const numbers: number[] = [];

    for (const packNo of packNos) {
        const number = Number.parseInt(packNo, 10);

        if (Number.isInteger(number) && String(number) === packNo) {
            numbers.push(number);
        } else {
            names.push(packNo === 'Temp' ? 'Dbt_Temp' : packNo);
        }
    }

    numbers.sort((a, b) => a - b);

    let index = 0;

    while (index < numbers.length) {
        const rangeStart = numbers[index];
        let rangeEnd = rangeStart;

        while (index + 1 < numbers.length && numbers[index + 1] === rangeEnd + 1) {
            index += 1;
            rangeEnd = numbers[index];
        }

        names.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
        index += 1;
    }

    return names.join(', ');
}

export interface RangeTrackingRequest extends ReportRequest {
    start: number;
    end: number;
    /**
     * true: bir işlemin ardından çağrılır (1-Dbt-Migrate bittikten sonra) — yalnız satır ve hata ekler,
     * işin sayaçlarına, durum ışığına ve işlem satırına dokunmaz.
     */
    appendOnly: boolean;
}

/**
 * Seçili migration'ın Start..End aralığındaki HER paketteki son koşu sonucu: kaç paket tamam, hangileri
 * hatalı / hiç koşmamış, hata metni ne. Kaynak sunucudaki iş sonucu değil, her paketin kendi
 * `__dbt_migrations_history` kaydıdır — kuyruk işi silinse ya da hata satırları kısaltılsa da kalır
 * (iş en çok 50 hata satırı tutuyor; 2607 paketlik aralıkta gerisi görünmüyordu).
 *
 * Aynı sebeple düşen paketler tek satırda gruplanır: 2607 paketin aynı hatası 2607 satır değil,
 * bir hata metni ve paket aralıkları olarak görünür.
 */
export async function runRangeTracking(request: RangeTrackingRequest): Promise<void> {
    const { apiBaseUrl, log, operationName, signal, start, end, appendOnly } = request;

    const migrationName = request.dbtMigrationName.trim();
    const prefixes = trackingPrefixes(start, end);

    const states: MigrationPackState[] = [];
    const unreadChunks: string[] = [];

    log.addLine('         *********************      ');
    log.addLine(`              Takip - ${migrationName} - ${start} - ${end}`);
    log.addLine('         *********************      ');

    for (let i = 0; i < prefixes.length; i++) {
        if (signal?.aborted) {
            log.addLine('         takip durduruldu');

            break;
        }

        if (!appendOnly) {
            log.setStatus(`${operationName} - Devam ediyor (${i + 1}/${prefixes.length})`, 'running');
        }

        const url = endpoints.migrationPacks(apiBaseUrl, String(prefixes[i]), migrationName, false);
        const result = await getJson<MigrationPackState[]>(url, signal, serviceKeyHeaders(apiBaseUrl));

        if (!result.isSuccess || !Array.isArray(result.data)) {
            const text = `${prefixes[i]}* okunamadı - ${result.error || `Status Code: ${result.status}`}`;

            unreadChunks.push(text);
            log.addError(text);

            continue;
        }

        for (const state of result.data) {
            const packNo = Number.parseInt(state.packNo ?? '', 10);

            // Önek dilimi aralıktan taşabilir (5000 → 500000-500099 ama Start 500050 olabilir).
            if (Number.isInteger(packNo) && packNo >= start && packNo <= end) {
                states.push(state);
            }
        }
    }

    reportRangeTracking({ log, operationName, migrationName, states, unreadChunks, appendOnly });
}

interface RangeReport {
    log: OperationLog;
    operationName: string;
    migrationName: string;
    states: MigrationPackState[];
    unreadChunks: string[];
    appendOnly: boolean;
}

function reportRangeTracking(report: RangeReport): void {
    const { log, operationName, migrationName, states, unreadChunks, appendOnly } = report;

    const ok = states.filter((d) => d.isApplied && d.isOk);
    const failed = states.filter((d) => d.isApplied && !d.isOk && !d.error?.trim());
    const notApplied = states.filter((d) => d.isTracked && !d.isApplied && !d.error?.trim());
    const notTracked = states.filter((d) => !d.isTracked && !d.error?.trim());
    const unreadable = states.filter((d) => !!d.error?.trim());

    const problems = failed.length + notApplied.length + notTracked.length + unreadable.length;

    log.addLine(`Toplam paket        : ${states.length}`);
    log.addLine(`Tamam (son koşu OK) : ${ok.length}`);
    log.addLine(`Hatalı bitti        : ${failed.length}`);
    log.addLine(`Hiç koşmamış        : ${notApplied.length}`);
    log.addLine(`Takip tablosu yok   : ${notTracked.length}`);
    log.addLine(`Okunamayan paket    : ${unreadable.length}`);

    const times = ok
        .map((d) => d.lastAppliedAt)
        .filter((d): d is string => !!d)
        .sort();

    if (times.length > 0) {
        log.addLine(
            `Tamam paketlerin son koşu zamanı: ${formatDateTime(times[0])} - ${formatDateTime(times[times.length - 1])}`,
        );
    }

    if (ok.length > 0) {
        log.addLine(`Tamam paketler: ${formatPackRanges(ok.map((d) => d.packNo ?? ''))}`);
    }

    log.addLine('         *********************      ');

    addGroups(log, 'HATALI', failed, (d) => d.message);
    addGroups(log, 'KAYIT YOK (migration bu pakette hiç koşmamış)', notApplied, () => 'takip kaydı yok');
    addGroups(log, 'TAKİP TABLOSU YOK', notTracked, () => 'MigrationHistoryInit koşturulmalı');
    addGroups(log, 'OKUNAMADI', unreadable, (d) => d.error);

    for (const unread of unreadChunks) {
        log.addLine(`Okunamayan parça: ${unread}`);
    }

    log.addLine(`              Takip tamamlandı - ${migrationName}`);
    log.addLine('         *********************      ');

    if (!appendOnly) {
        const counters = emptyCounters();

        counters.queued = states.length;
        counters.success = ok.length;
        counters.error = problems;

        log.setCounters(counters);
        log.setOperation(
            `${operationName} - ${migrationName} | tamam: ${ok.length} | sorunlu: ${problems} | toplam: ${states.length}`,
        );
        log.setStatus(
            `${operationName} - Tamamlandı`,
            problems === 0 && unreadChunks.length === 0 && states.length > 0 ? 'succeeded' : 'failed',
        );
    }

    log.flushNow();
}

function addGroups(
    log: OperationLog,
    title: string,
    packs: MigrationPackState[],
    reason: (state: MigrationPackState) => string | null | undefined,
): void {
    const groups = new Map<string, MigrationPackState[]>();

    for (const pack of packs) {
        const key = (reason(pack) ?? '').trim();

        groups.set(key, [...(groups.get(key) ?? []), pack]);
    }

    for (const [key, group] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
        log.addError(`${title} - ${group.length} paket: ${formatPackRanges(group.map((d) => d.packNo ?? ''))}`);
        log.addError(`    sebep: ${key || '(mesaj yok)'}`);
    }
}
