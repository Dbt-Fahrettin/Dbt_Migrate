import { describe, expect, it } from 'vitest';
import type { CrossWrittenXmlRepairResult } from '../../api/gibXmlRepair';
import type { ApiResult } from '../../api/http';
import { MAX_CONSECUTIVE_FAILURES, buildRepairCsv, runRepairLoop } from './xmlRepairLoop';
import type { RepairCall, RepairTotals } from './xmlRepairLoop';

const GIB = 'https://test.unideva.com/gib/api';

function batch(partial: Partial<CrossWrittenXmlRepairResult> = {}): ApiResult<CrossWrittenXmlRepairResult> {
    const data: CrossWrittenXmlRepairResult = {
        isDryRun: true,
        groupCount: 2,
        rowCount: 5,
        ownerRows: 2,
        wrongRows: 3,
        clearedRows: 0,
        refetchedRows: 0,
        leftEmptyRows: 0,
        unverifiableRows: 0,
        ownerFilledRows: 1,
        ownerAlreadyStored: 1,
        ownerMissing: 0,
        nextHash: 'h2',
        hasMore: false,
        elapsedSeconds: 10,
        rows: [{ id: 'r1', packNo: 500292, faturaNo: 'GIB2026000000011', direction: 'gelen', docType: 'EArchive', action: 'Temizlenecek', note: 'XML başka belgenin; (A)' }],
        ...partial,
    };

    return { isSuccess: true, status: 200, content: '', data, error: '' };
}

function fail(status: number): ApiResult<CrossWrittenXmlRepairResult> {
    return { isSuccess: false, status, content: '', data: null, error: `Status Code: ${status}` };
}

describe('runRepairLoop', () => {
    it('follows the cursor until hasMore is false and sums batches', async () => {
        const cursors: string[] = [];
        const call: RepairCall = async (_api, _token, _dry, afterHash) => {
            cursors.push(afterHash);

            return afterHash === '' ? batch({ hasMore: true, nextHash: 'h1' }) : batch({ nextHash: 'h2' });
        };

        let last: RepairTotals | null = null;
        const state = await runRepairLoop({
            gibApiBaseUrl: GIB, token: 't', dryRun: true, maxGroups: 40,
            shouldStop: () => false, onProgress: (t) => (last = t), onError: () => {}, call,
        });

        expect(state).toBe('done');
        expect(cursors).toEqual(['', 'h1']);
        expect(last!.wrongRows).toBe(6);
        expect(last!.rows).toHaveLength(2);
    });

    it('retries the same cursor on transport errors, gives up after the limit', async () => {
        let calls = 0;
        const call: RepairCall = async () => {
            calls += 1;

            return fail(524);
        };

        const state = await runRepairLoop({
            gibApiBaseUrl: GIB, token: 't', dryRun: false, maxGroups: 40,
            shouldStop: () => false, onProgress: () => {}, onError: () => {}, call,
        });

        expect(state).toBe('failed');
        expect(calls).toBe(MAX_CONSECUTIVE_FAILURES);
    });

    it('stops immediately on 401', async () => {
        let calls = 0;
        const call: RepairCall = async () => {
            calls += 1;

            return fail(401);
        };

        expect(await runRepairLoop({
            gibApiBaseUrl: GIB, token: 't', dryRun: true, maxGroups: 40,
            shouldStop: () => false, onProgress: () => {}, onError: () => {}, call,
        })).toBe('failed');
        expect(calls).toBe(1);
    });

    it('fails when the cursor does not move', async () => {
        const call: RepairCall = async () => batch({ hasMore: true, nextHash: '' });

        expect(await runRepairLoop({
            gibApiBaseUrl: GIB, token: 't', dryRun: true, maxGroups: 40,
            shouldStop: () => false, onProgress: () => {}, onError: () => {}, call,
        })).toBe('failed');
    });
});

describe('buildRepairCsv', () => {
    it('writes a BOM, semicolons and quotes cells with separators', async () => {
        let totals: RepairTotals | null = null;

        await runRepairLoop({
            gibApiBaseUrl: GIB, token: 't', dryRun: true, maxGroups: 40,
            shouldStop: () => false, onProgress: (t) => (totals = t), onError: () => {},
            call: async () => batch(),
        });

        const csv = buildRepairCsv(totals!);

        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv.slice(1).startsWith('İşlem;Paket;Fatura no')).toBe(true);
        expect(csv).toContain('Temizlenecek;500292;GIB2026000000011;gelen;EArchive;"XML başka belgenin; (A)";r1');
    });
});
