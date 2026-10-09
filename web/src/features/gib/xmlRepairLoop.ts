import { describeGibFailure } from '../../api/gibClient';
import { repairCrossWrittenXml } from '../../api/gibXmlRepair';
import type { CrossWrittenXmlRepairResult, CrossWrittenXmlRowAction } from '../../api/gibXmlRepair';
import type { ApiResult } from '../../api/http';

/**
 * Yanlış satıra yazılmış XML onarımının imleç döngüsü — React'ten bağımsız, testlenebilir.
 *
 * Sunucu bir çağrıda en çok `maxGroups` XML grubunu ~60 sn içinde işler ve kaldığı yeri `nextHash` ile döner; döngü
 * `hasMore` bitene kadar sürer. Taşıma hatasında çağrı aynı imleçle yeniden denenir (prova da gerçek onarım da aynı
 * imleçten devam etmeye dayanıklı: temizlenen satır bir sonraki taramada şüpheli kümeden düşer).
 */

export const MAX_CONSECUTIVE_FAILURES = 3;

export type RepairRunState = 'idle' | 'running' | 'done' | 'stopped' | 'failed';

export interface RepairTotals {
    dryRun: boolean;
    callCount: number;
    groupCount: number;
    rowCount: number;
    ownerRows: number;
    wrongRows: number;
    clearedRows: number;
    refetchedRows: number;
    leftEmptyRows: number;
    unverifiableRows: number;
    ownerFilledRows: number;
    ownerAlreadyStored: number;
    ownerMissing: number;
    elapsedSeconds: number;
    rows: CrossWrittenXmlRowAction[];
}

export function emptyTotals(dryRun: boolean): RepairTotals {
    return {
        dryRun,
        callCount: 0,
        groupCount: 0,
        rowCount: 0,
        ownerRows: 0,
        wrongRows: 0,
        clearedRows: 0,
        refetchedRows: 0,
        leftEmptyRows: 0,
        unverifiableRows: 0,
        ownerFilledRows: 0,
        ownerAlreadyStored: 0,
        ownerMissing: 0,
        elapsedSeconds: 0,
        rows: [],
    };
}

export function addBatch(totals: RepairTotals, batch: CrossWrittenXmlRepairResult): RepairTotals {
    return {
        ...totals,
        callCount: totals.callCount + 1,
        groupCount: totals.groupCount + batch.groupCount,
        rowCount: totals.rowCount + batch.rowCount,
        ownerRows: totals.ownerRows + batch.ownerRows,
        wrongRows: totals.wrongRows + batch.wrongRows,
        clearedRows: totals.clearedRows + batch.clearedRows,
        refetchedRows: totals.refetchedRows + batch.refetchedRows,
        leftEmptyRows: totals.leftEmptyRows + batch.leftEmptyRows,
        unverifiableRows: totals.unverifiableRows + batch.unverifiableRows,
        ownerFilledRows: totals.ownerFilledRows + batch.ownerFilledRows,
        ownerAlreadyStored: totals.ownerAlreadyStored + batch.ownerAlreadyStored,
        ownerMissing: totals.ownerMissing + batch.ownerMissing,
        elapsedSeconds: totals.elapsedSeconds + batch.elapsedSeconds,
        rows: [...totals.rows, ...(batch.rows ?? [])],
    };
}

export type RepairCall = (
    gibApiBaseUrl: string,
    token: string | null | undefined,
    dryRun: boolean,
    afterHash: string,
    maxGroups: number,
) => Promise<ApiResult<CrossWrittenXmlRepairResult>>;

export interface RepairLoopOptions {
    gibApiBaseUrl: string;
    token: string | null | undefined;
    dryRun: boolean;
    maxGroups: number;
    shouldStop: () => boolean;
    onProgress: (totals: RepairTotals) => void;
    onError: (message: string) => void;
    call?: RepairCall;
}

export async function runRepairLoop(options: RepairLoopOptions): Promise<RepairRunState> {
    const { gibApiBaseUrl, token, dryRun, maxGroups, shouldStop, onProgress, onError } = options;
    const call = options.call ?? repairCrossWrittenXml;

    let totals = emptyTotals(dryRun);
    let afterHash = '';
    let failures = 0;

    onProgress(totals);

    for (;;) {
        const result = await call(gibApiBaseUrl, token, dryRun, afterHash, maxGroups);

        if (!result.isSuccess || !result.data) {
            failures += 1;

            const message = describeGibFailure(result);

            if (failures >= MAX_CONSECUTIVE_FAILURES || result.status === 401 || result.status === 403) {
                onError(message);

                return 'failed';
            }

            onError(`${message} (yeniden deneniyor ${failures}/${MAX_CONSECUTIVE_FAILURES})`);

            continue;
        }

        failures = 0;
        onError('');

        totals = addBatch(totals, result.data);
        onProgress(totals);

        if (!result.data.hasMore) {
            return 'done';
        }

        if (shouldStop()) {
            return 'stopped';
        }

        // İmleç ilerlemediyse sonsuz döngüye girme.
        if (result.data.nextHash === afterHash) {
            onError('Sunucu ilerleme bildirmedi (imleç aynı kaldı); döngü durduruldu.');

            return 'failed';
        }

        afterHash = result.data.nextHash;
    }
}

function csvCell(value: string): string {
    return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Satır bazında onarım listesi; `;` ayraçlı ve BOM'lu (Excel Türkçe). */
export function buildRepairCsv(totals: RepairTotals): string {
    const header = ['İşlem', 'Paket', 'Fatura no', 'Yön', 'Tür', 'Not', 'Satır id'];
    const lines = totals.rows.map((row) =>
        [
            row.action,
            row.packNo == null ? '' : String(row.packNo),
            row.faturaNo,
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
