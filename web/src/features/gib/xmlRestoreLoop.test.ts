import { describe, expect, it } from 'vitest';
import type { ClearedXmlRestoreResult } from '../../api/gibXmlRepair';
import type { ApiResult } from '../../api/http';
import { buildRestoreCsv, requeryRanges, runRestoreLoop } from './xmlRestoreLoop';
import type { RestoreCall, RestoreTotals } from './xmlRestoreLoop';

const GIB = 'https://test.unideva.com/gib/api';
const WINDOW = { fromUtc: '2026-10-09T20:44:00Z', toUtc: '2026-10-09T20:47:00Z' };

function batch(partial: Partial<ClearedXmlRestoreResult> = {}): ApiResult<ClearedXmlRestoreResult> {
    const data: ClearedXmlRestoreResult = {
        isDryRun: true,
        rowCount: 3,
        writtenRows: 1,
        noUrlRows: 1,
        notFetchedRows: 1,
        rejectedRows: 0,
        nextCounter: 100,
        hasMore: false,
        elapsedSeconds: 20,
        rows: [
            { id: 'a', packNo: 500292, faturaNo: 'A1', faturaTarihi: '2026-07-03T00:00:00', direction: 'giden', docType: 'EArchive', action: 'Yazılacak', note: 'ok' },
            { id: 'b', packNo: 500292, faturaNo: 'B1', faturaTarihi: '2026-07-10T00:00:00', direction: 'giden', docType: 'EInvoice', action: 'Adres yok', note: 'x; y' },
            { id: 'c', packNo: 500292, faturaNo: 'C1', faturaTarihi: '2026-06-28T00:00:00', direction: 'gelen', docType: 'EArchive', action: 'Alınamadı', note: 'DNS' },
        ],
        ...partial,
    };

    return { isSuccess: true, status: 200, content: '', data, error: '' };
}

describe('runRestoreLoop', () => {
    it('follows nextCounter and sums batches', async () => {
        const cursors: number[] = [];
        const call: RestoreCall = async (_a, _t, _f, _to, _d, afterCounter) => {
            cursors.push(afterCounter);

            return afterCounter === 0 ? batch({ hasMore: true, nextCounter: 50 }) : batch({ nextCounter: 90 });
        };

        let last: RestoreTotals | null = null;
        const state = await runRestoreLoop({
            gibApiBaseUrl: GIB, token: 't', ...WINDOW, dryRun: true, maxRows: 40,
            shouldStop: () => false, onProgress: (t) => (last = t), onError: () => {}, call,
        });

        expect(state).toBe('done');
        expect(cursors).toEqual([0, 50]);
        expect(last!.writtenRows).toBe(2);
        expect(last!.rows).toHaveLength(6);
    });

    it('stops on 400 (bad window) without retrying', async () => {
        let calls = 0;
        const call: RestoreCall = async () => {
            calls += 1;

            return { isSuccess: false, status: 400, content: 'pencere', data: null, error: 'Status Code: 400' };
        };

        expect(await runRestoreLoop({
            gibApiBaseUrl: GIB, token: 't', ...WINDOW, dryRun: true, maxRows: 40,
            shouldStop: () => false, onProgress: () => {}, onError: () => {}, call,
        })).toBe('failed');
        expect(calls).toBe(1);
    });

    it('fails when the cursor does not advance', async () => {
        const call: RestoreCall = async () => batch({ hasMore: true, nextCounter: 0 });

        expect(await runRestoreLoop({
            gibApiBaseUrl: GIB, token: 't', ...WINDOW, dryRun: true, maxRows: 40,
            shouldStop: () => false, onProgress: () => {}, onError: () => {}, call,
        })).toBe('failed');
    });
});

describe('restore report', () => {
    it('lists requery ranges per pack only for rows that could not be restored', async () => {
        let totals: RestoreTotals | null = null;

        await runRestoreLoop({
            gibApiBaseUrl: GIB, token: 't', ...WINDOW, dryRun: true, maxRows: 40,
            shouldStop: () => false, onProgress: (t) => (totals = t), onError: () => {}, call: async () => batch(),
        });

        expect(requeryRanges(totals!)).toEqual([{ packNo: 500292, from: '2026-06-28', to: '2026-07-10', rows: 2 }]);

        const csv = buildRestoreCsv(totals!);

        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain('Adres yok;500292;B1;2026-07-10;giden;EInvoice;"x; y";b');
    });
});
