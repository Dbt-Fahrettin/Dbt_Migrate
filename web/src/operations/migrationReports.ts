import { endpoints } from '../api/endpoints';
import { getJson } from '../api/http';
import type { OperationLog } from './operationLog';
import { emptyCounters } from './types';

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

/** `2026-09-07T10:23:45Z` → `07.09.2026 10:23:45`; okunamıyorsa boş. */
export function formatDateTime(value: string | null | undefined): string {
    if (!value) {
        return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const pad = (n: number) => String(n).padStart(2, '0');

    return (
        `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}` +
        ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
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

    const result = await getJson<MigrationHistoryItem[]>(url);

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

    const result = await getJson<MigrationPackState[]>(url);

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
