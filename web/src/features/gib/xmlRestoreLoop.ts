import { describeGibFailure } from '../../api/gibClient';
import { restoreClearedXml } from '../../api/gibXmlRepair';
import type { ClearedXmlRestoreResult, ClearedXmlRestoreRow } from '../../api/gibXmlRepair';
import type { ApiResult } from '../../api/http';

/**
 * Boşaltılan XML'lerin geri yükleme döngüsü — React'ten bağımsız, testlenebilir.
 *
 * Sunucu bir çağrıda en çok `maxRows` satırı ~55 sn içinde işler ve kaldığı yeri `nextCounter` ile döner. Yazılan satır
 * kümeden düşer; adresi olmayan ya da indirilemeyen satırlar kalır ve raporlanır (Paket Yeniden Sorgu ile tamamlanır).
 */

export const MAX_CONSECUTIVE_FAILURES = 3;

/** 09.10.2026 onarımının boşalttığı satırların penceresi (UTC). */
export const DEFAULT_RESTORE_WINDOW = { fromUtc: '2026-10-09T20:44:00Z', toUtc: '2026-10-09T20:47:00Z' };

export type RestoreRunState = 'idle' | 'running' | 'done' | 'stopped' | 'failed';

export interface RestoreTotals {
    dryRun: boolean;
    callCount: number;
    rowCount: number;
    writtenRows: number;
    noUrlRows: number;
    notFetchedRows: number;
    rejectedRows: number;
    elapsedSeconds: number;
    rows: ClearedXmlRestoreRow[];
}

export function emptyRestoreTotals(dryRun: boolean): RestoreTotals {
    return {
        dryRun,
        callCount: 0,
        rowCount: 0,
        writtenRows: 0,
        noUrlRows: 0,
        notFetchedRows: 0,
        rejectedRows: 0,
        elapsedSeconds: 0,
        rows: [],
    };
}

export function addRestoreBatch(totals: RestoreTotals, batch: ClearedXmlRestoreResult): RestoreTotals {
    return {
        ...totals,
        callCount: totals.callCount + 1,
        rowCount: totals.rowCount + batch.rowCount,
        writtenRows: totals.writtenRows + batch.writtenRows,
        noUrlRows: totals.noUrlRows + batch.noUrlRows,
        notFetchedRows: totals.notFetchedRows + batch.notFetchedRows,
        rejectedRows: totals.rejectedRows + batch.rejectedRows,
        elapsedSeconds: totals.elapsedSeconds + batch.elapsedSeconds,
        rows: [...totals.rows, ...(batch.rows ?? [])],
    };
}

export type RestoreCall = (
    gibApiBaseUrl: string,
    token: string | null | undefined,
    fromUtc: string,
    toUtc: string,
    dryRun: boolean,
    afterCounter: number,
    maxRows: number,
) => Promise<ApiResult<ClearedXmlRestoreResult>>;

export interface RestoreLoopOptions {
    gibApiBaseUrl: string;
    token: string | null | undefined;
    fromUtc: string;
    toUtc: string;
    dryRun: boolean;
    maxRows: number;
    shouldStop: () => boolean;
    onProgress: (totals: RestoreTotals) => void;
    onError: (message: string) => void;
    call?: RestoreCall;
}

export async function runRestoreLoop(options: RestoreLoopOptions): Promise<RestoreRunState> {
    const { gibApiBaseUrl, token, fromUtc, toUtc, dryRun, maxRows, shouldStop, onProgress, onError } = options;
    const call = options.call ?? restoreClearedXml;

    let totals = emptyRestoreTotals(dryRun);
    let afterCounter = 0;
    let failures = 0;

    onProgress(totals);

    for (;;) {
        const result = await call(gibApiBaseUrl, token, fromUtc, toUtc, dryRun, afterCounter, maxRows);

        if (!result.isSuccess || !result.data) {
            failures += 1;

            const message = describeGibFailure(result);

            if (failures >= MAX_CONSECUTIVE_FAILURES || [400, 401, 403].includes(result.status)) {
                onError(message);

                return 'failed';
            }

            onError(`${message} (yeniden deneniyor ${failures}/${MAX_CONSECUTIVE_FAILURES})`);

            continue;
        }

        failures = 0;
        onError('');

        totals = addRestoreBatch(totals, result.data);
        onProgress(totals);

        if (!result.data.hasMore) {
            return 'done';
        }

        if (shouldStop()) {
            return 'stopped';
        }

        if (result.data.nextCounter <= afterCounter) {
            onError('Sunucu ilerleme bildirmedi (imleç aynı kaldı); döngü durduruldu.');

            return 'failed';
        }

        afterCounter = result.data.nextCounter;
    }
}

function csvCell(value: string): string {
    return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Satır bazında geri yükleme listesi (Paket Yeniden Sorgu için paket ve tarih dahil); `;` ayraçlı, BOM'lu. */
export function buildRestoreCsv(totals: RestoreTotals): string {
    const header = ['İşlem', 'Paket', 'Fatura no', 'Fatura tarihi', 'Yön', 'Tür', 'Not', 'Satır id'];
    const lines = totals.rows.map((row) =>
        [
            row.action,
            row.packNo == null ? '' : String(row.packNo),
            row.faturaNo,
            (row.faturaTarihi ?? '').slice(0, 10),
            row.direction,
            row.docType,
            row.note,
            row.id,
        ]
            .map(csvCell)
            .join(';'),
    );

    return `﻿${[header.map(csvCell).join(';'), ...lines].join('\r\n')}\r\n`;
}

/** Paket Yeniden Sorgu için: tamamlanamayan satırların paket başına tarih aralığı. */
export function requeryRanges(totals: RestoreTotals): { packNo: number; from: string; to: string; rows: number }[] {
    const map = new Map<number, { packNo: number; from: string; to: string; rows: number }>();

    for (const row of totals.rows) {
        if (row.packNo == null || !['Adres yok', 'Alınamadı'].includes(row.action)) {
            continue;
        }

        const day = (row.faturaTarihi ?? '').slice(0, 10);
        const entry = map.get(row.packNo) ?? { packNo: row.packNo, from: day, to: day, rows: 0 };

        entry.from = day < entry.from ? day : entry.from;
        entry.to = day > entry.to ? day : entry.to;
        entry.rows += 1;
        map.set(row.packNo, entry);
    }

    return [...map.values()].sort((a, b) => b.rows - a.rows);
}
