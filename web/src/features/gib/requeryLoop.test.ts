import { describe, expect, it, vi } from 'vitest';
import { MAX_CONSECUTIVE_FAILURES, MAX_UNIT_ROWS, runRequeryLoop } from './requeryLoop';
import type { RequeryCall, RequeryProgress } from './requeryLoop';
import type { PackRequeryResult, PackRequeryUnitResult } from '../../api/gibRequery';
import type { ApiResult } from '../../api/http';

const GIB = 'https://test.unideva.com/gib/api';
const REQUEST = { packNo: 500292, startDate: '2026-09-01' };

function unit(partial: Partial<PackRequeryUnitResult> = {}): PackRequeryUnitResult {
    return {
        taxPayer: '1234567890',
        kind: 'EArsiv',
        startDate: '2026-09-01T00:00:00',
        endDate: '2026-09-07T00:00:00',
        isOk: true,
        invoiceCount: 3,
        fromCacheCount: 1,
        newContentCount: 2,
        withoutContentCount: 0,
        elapsedSeconds: 1.5,
        ...partial,
    };
}

function page(partial: Partial<PackRequeryResult> = {}): ApiResult<PackRequeryResult> {
    const data: PackRequeryResult = {
        isOk: true,
        message: 'devam',
        packNo: 500292,
        startDate: '2026-09-01T00:00:00',
        endDate: '2026-09-28T00:00:00',
        taxPayerCount: 12,
        totalUnitCount: 10,
        processedUnitCount: 5,
        errorUnitCount: 0,
        invoiceCount: 15,
        fromCacheCount: 5,
        newContentCount: 10,
        withoutContentCount: 0,
        skippedTaxPayers: [],
        units: [unit()],
        nextCursor: 'c1',
        hasMore: true,
        elapsedSeconds: 30,
        ...partial,
    };

    return { isSuccess: true, status: 200, content: '', data, error: '' };
}

function failure(status: number, error = 'patladi'): ApiResult<PackRequeryResult> {
    return { isSuccess: false, status, content: '', data: null, error };
}

/** Sırayla verilen yanıtları döndüren sahte uç; son yanıt tekrarlanır. */
function callSequence(responses: ApiResult<PackRequeryResult>[]) {
    const seenCursors: (string | undefined)[] = [];
    let index = 0;

    const call: RequeryCall = vi.fn(async (_api, _token, request) => {
        seenCursors.push(request.cursor);

        const response = responses[Math.min(index, responses.length - 1)];

        index += 1;

        return response;
    });

    return { call, seenCursors, callCount: () => index };
}

async function run(responses: ApiResult<PackRequeryResult>[], shouldStop: () => boolean = () => false) {
    const progressSnapshots: RequeryProgress[] = [];
    const errors: string[] = [];
    const sequence = callSequence(responses);

    const state = await runRequeryLoop({
        gibApiBaseUrl: GIB,
        token: 'belirtec',
        request: REQUEST,
        shouldStop,
        onProgress: (p) => progressSnapshots.push(p),
        onError: (m) => errors.push(m),
        call: sequence.call,
    });

    return { state, progressSnapshots, errors, ...sequence };
}

describe('runRequeryLoop', () => {
    it('hasMore bitene kadar imleci geri göndererek devam eder', async () => {
        const { state, seenCursors, callCount } = await run([
            page({ nextCursor: 'c1', hasMore: true }),
            page({ nextCursor: 'c2', hasMore: true, processedUnitCount: 3 }),
            page({ nextCursor: null, hasMore: false, processedUnitCount: 2, message: 'Tamamlandi' }),
        ]);

        expect(state).toBe('done');
        expect(callCount()).toBe(3);
        // İlk çağrıda imleç boş, sonrakiler önceki yanıtın NextCursor'ı.
        expect(seenCursors).toEqual([undefined, 'c1', 'c2']);
    });

    it('ilerlemeyi çağrılar boyunca toplar; toplam birim paydadır', async () => {
        const { progressSnapshots } = await run([
            page({ processedUnitCount: 5, invoiceCount: 15, fromCacheCount: 5, newContentCount: 10 }),
            page({
                processedUnitCount: 5,
                invoiceCount: 9,
                fromCacheCount: 2,
                newContentCount: 7,
                hasMore: false,
                nextCursor: null,
            }),
        ]);

        const last = progressSnapshots[progressSnapshots.length - 1];

        expect(last.processedUnits).toBe(10);
        expect(last.totalUnits).toBe(10); // payda her çağrıda aynı gelir, toplanmaz
        expect(last.invoiceCount).toBe(24);
        expect(last.fromCacheCount).toBe(7);
        expect(last.newContentCount).toBe(17);
        expect(last.callCount).toBe(2);
    });

    it('atlanan mükellefleri tekrarlamadan biriktirir', async () => {
        const { progressSnapshots } = await run([
            page({ skippedTaxPayers: ['111', '222'] }),
            page({ skippedTaxPayers: ['222', '333'], hasMore: false, nextCursor: null }),
        ]);

        const last = progressSnapshots[progressSnapshots.length - 1];

        expect(last.skippedTaxPayers).toEqual(['111', '222', '333']);
    });

    it('birim listesini son MAX_UNIT_ROWS satırla sınırlar', async () => {
        const many = Array.from({ length: MAX_UNIT_ROWS + 50 }, (_, i) => unit({ taxPayer: `t${i}` }));

        const { progressSnapshots } = await run([page({ units: many, hasMore: false, nextCursor: null })]);

        const last = progressSnapshots[progressSnapshots.length - 1];

        expect(last.units).toHaveLength(MAX_UNIT_ROWS);
        // En yeniler tutulur.
        expect(last.units[last.units.length - 1].taxPayer).toBe(`t${MAX_UNIT_ROWS + 49}`);
    });

    it('Durdur sonrası yeni çağrı açmaz', async () => {
        let stop = false;

        const { state, callCount } = await run([page({ hasMore: true })], () => {
            const current = stop;

            stop = true; // ilk kontrolde false, sonrasında true

            return current;
        });

        expect(state).toBe('stopped');
        expect(callCount()).toBe(2);
    });

    /**
     * Sunucu hata durumunda NextCursor'ı AYNI döndürüp HasMore=true diyor. Kalıcı hatada bu
     * sonsuz döngü olurdu; sayaç onu kesiyor.
     */
    it('art arda hatada sınıra gelince durur', async () => {
        const { state, callCount, errors } = await run([failure(500)]);

        expect(state).toBe('failed');
        expect(callCount()).toBe(MAX_CONSECUTIVE_FAILURES);
        expect(errors.some((e) => e.includes('yeniden deneniyor'))).toBe(true);
    });

    it('401de hiç yeniden denemez - belirteç kendiliğinden tazelenmez', async () => {
        const { state, callCount, errors } = await run([failure(401)]);

        expect(state).toBe('failed');
        expect(callCount()).toBe(1);
        expect(errors[errors.length - 1]).toContain('401');
    });

    it('geçici hatadan sonra başarı gelirse sayaç sıfırlanır', async () => {
        const { state, callCount } = await run([failure(500), page({ hasMore: false, nextCursor: null })]);

        expect(state).toBe('done');
        expect(callCount()).toBe(2);
    });

    it('IsOk false yanıtlar da sınıra takılır', async () => {
        const { state, callCount } = await run([
            page({ isOk: false, message: 'sorgu basarisiz', processedUnitCount: 0, nextCursor: 'c1' }),
        ]);

        expect(state).toBe('failed');
        expect(callCount()).toBe(MAX_CONSECUTIVE_FAILURES);
    });

    /**
     * Birim hatası çağrı hatası değildir: sunucu birimleri işleyip bazılarında mükellef kaynaklı
     * hata bulduğunda IsOk=false döner ama imleci ilerletir. Döngü durmamalı (503956 vakası:
     * her çağrıda hatalı birim vardı, döngü 3 çağrıda "failed" oluyordu).
     */
    it('IsOk false ama birim işlendiyse durmaz, hataları sayar', async () => {
        const { state, callCount, progressSnapshots } = await run([
            page({ isOk: false, processedUnitCount: 5, errorUnitCount: 2, nextCursor: 'c1' }),
            page({ isOk: false, processedUnitCount: 5, errorUnitCount: 3, nextCursor: 'c2' }),
            page({ isOk: false, processedUnitCount: 5, errorUnitCount: 1, nextCursor: 'c3' }),
            page({ isOk: false, processedUnitCount: 5, errorUnitCount: 4, nextCursor: 'c4' }),
            page({ isOk: true, processedUnitCount: 5, errorUnitCount: 0, nextCursor: null, hasMore: false }),
        ]);

        const last = progressSnapshots[progressSnapshots.length - 1];

        expect(state).toBe('done');
        expect(callCount()).toBe(5); // MAX_CONSECUTIVE_FAILURES'ı aştı ama durmadı
        expect(last.errorUnits).toBe(10);
        expect(last.processedUnits).toBe(25);
    });

    /** Sunucu "devam var" deyip imleci ilerletmezse döngü kilitlenirdi. */
    it('imleç ilerlemiyorsa durur', async () => {
        const { state, callCount, errors } = await run([
            page({ processedUnitCount: 0, nextCursor: undefined, hasMore: true }),
        ]);

        expect(state).toBe('failed');
        expect(callCount()).toBe(1);
        expect(errors[errors.length - 1]).toContain('ilerleme bildirmedi');
    });
});
