import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPERATION_KINDS, validateRequest, type OperationRequest } from './adminOperations';
import { forEachBounded } from './boundedConcurrency';
import { OperationLog } from './operationLog';
import { isOkResponse } from './sequentialOperation';
import { runFunctionRenew, runUpdateSalerId } from './syncOperations';
import type { SyncOperationRequest } from './syncOperations';

const API = 'https://ornek.test/svc/api';

async function runWithTimers(promise: Promise<void>): Promise<void> {
    let isDone = false;

    const tracked = promise.then(() => {
        isDone = true;
    });

    for (let i = 0; i < 500 && !isDone; i += 1) {
        await vi.advanceTimersByTimeAsync(500);
    }

    await tracked;
}

function baseRequest(log: OperationLog, overrides: Partial<SyncOperationRequest> = {}): SyncOperationRequest {
    return {
        apiBaseUrl: API,
        log,
        operationName: 'test',
        startText: '500001',
        endText: '500003',
        datNames: ['Dbt_500001', 'Dbt_500002', 'Dbt_500003'],
        functionName: 'SetCardTotalFunctions',
        docStartDate: '2026-01-01',
        docEndDate: '2026-09-12',
        signal: new AbortController().signal,
        ...overrides,
    };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('isOkResponse', () => {
    it('alanı JSON olarak okur - boşluk biçiminden bağımsız', () => {
        expect(isOkResponse('{"isOk":true}')).toBe(true);
        expect(isOkResponse('{"isOk": true}')).toBe(true);
        expect(isOkResponse('{"message":"x","isOk":true}')).toBe(true);
    });

    it('büyük/küçük harf duyarsız okur', () => {
        expect(isOkResponse('{"IsOk":true}')).toBe(true);
    });

    it('false ve eksik alanı başarısız sayar', () => {
        expect(isOkResponse('{"isOk":false}')).toBe(false);
        expect(isOkResponse('{"message":"x"}')).toBe(false);
        expect(isOkResponse('')).toBe(false);
    });

    it('JSON olmayan gövdede eski metin kontrolüne düşer', () => {
        expect(isOkResponse('sonuc: "isOk": true, tamam')).toBe(true);
        expect(isOkResponse('bir hata oldu')).toBe(false);
    });
});

describe('forEachBounded', () => {
    it('her öğeyi bir kez işler ve eşzamanlılık sınırını aşmaz', async () => {
        vi.useRealTimers();

        const items = Array.from({ length: 20 }, (_, i) => i);
        const seen: number[] = [];

        let active = 0;
        let maxActive = 0;

        await forEachBounded(items, 6, async (item) => {
            active += 1;
            maxActive = Math.max(maxActive, active);

            await new Promise((resolve) => setTimeout(resolve, 1));

            seen.push(item);
            active -= 1;
        });

        expect(seen.sort((a, b) => a - b)).toEqual(items);
        expect(maxActive).toBeLessThanOrEqual(6);
        expect(maxActive).toBeGreaterThan(1);
    });

    it('boş listede hiç çalışmaz', async () => {
        const body = vi.fn();

        await forEachBounded([], 6, body);

        expect(body).not.toHaveBeenCalled();
    });
});

describe('runFunctionRenew', () => {
    it('her paket için fonksiyon adını uca gönderir ve sonucu yazar', async () => {
        const calls: string[] = [];

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                calls.push(url);

                return new Response('ok', { status: 200 });
            }),
        );

        const log = new OperationLog();

        await runWithTimers(runFunctionRenew(baseRequest(log)));

        const snapshot = log.getSnapshot();

        expect(calls).toHaveLength(3);
        expect(calls[0]).toContain('master/set-total-function/');
        expect(calls.every((d) => d.endsWith('/SetCardTotalFunctions'))).toBe(true);
        expect(snapshot.counters.success).toBe(3);
        expect(snapshot.counters.error).toBe(0);
        expect(snapshot.state).toBe('succeeded');
    });

    it('hatalı paketi hata listesine alır', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) =>
                url.includes('/500002/') ? new Response('patladi', { status: 500 }) : new Response('ok'),
            ),
        );

        const log = new OperationLog();

        await runWithTimers(runFunctionRenew(baseRequest(log)));

        const snapshot = log.getSnapshot();

        expect(snapshot.counters.success).toBe(2);
        expect(snapshot.counters.error).toBe(1);
        expect(snapshot.errors.join('\n')).toContain('Dbt_500002');
        expect(snapshot.state).toBe('failed');
    });
});

describe('runUpdateSalerId', () => {
    it('tarihleri ISO olarak gönderir ve isOk alanına göre başarı sayar', async () => {
        const calls: string[] = [];

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                calls.push(url);

                // Boşluksuz JSON: WPF'in ham metin kontrolü burada yanlış sonuç veriyordu.
                return new Response('{"isOk":true}', { status: 200 });
            }),
        );

        const log = new OperationLog();

        await runWithTimers(runUpdateSalerId(baseRequest(log)));

        const snapshot = log.getSnapshot();

        expect(calls).toHaveLength(3);
        expect(calls[0]).toContain('dbtRenewal/updateSalerPackCompanies/500001/2026-01-01/2026-09-12');
        expect(snapshot.counters.success).toBe(3);
        expect(snapshot.counters.error).toBe(0);
    });

    it('isOk false ise HTTP 200 olsa da hata sayar', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('{"isOk":false}', { status: 200 })),
        );

        const log = new OperationLog();

        await runWithTimers(runUpdateSalerId(baseRequest(log)));

        expect(log.getSnapshot().counters.error).toBe(3);
        expect(log.getSnapshot().counters.success).toBe(0);
    });

    it('durdurulduğunda kalan paketleri işlemez', async () => {
        const controller = new AbortController();
        const calls: string[] = [];

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                calls.push(url);
                controller.abort();

                return new Response('{"isOk":true}', { status: 200 });
            }),
        );

        const log = new OperationLog();

        await runWithTimers(runUpdateSalerId(baseRequest(log, { signal: controller.signal })));

        expect(calls).toHaveLength(1);
        expect(log.getSnapshot().lines.join('\n')).toContain('işlem durduruldu');
    });
});

describe('validateRequest', () => {
    function request(overrides: Partial<OperationRequest> = {}): OperationRequest {
        return {
            apiBaseUrl: API,
            log: new OperationLog(),
            operationName: 'test',
            startText: '500001',
            endText: '',
            datNames: null,
            isBetweenMode: false,
            dbtMigrationName: '',
            functionName: '',
            docStartDate: '',
            docEndDate: '',
            onlyMissing: false,
            withTaxpayers: false,
            token: '',
            vknText: '',
            signal: new AbortController().signal,
            ...overrides,
        };
    }

    it('Start zorunlu ve sayı olmalı', () => {
        expect(validateRequest(OPERATION_KINDS.migrate, request({ startText: '' }))).toContain('Start');
        expect(validateRequest(OPERATION_KINDS.migrate, request({ startText: 'abc' }))).toContain('sayı');
        expect(validateRequest(OPERATION_KINDS.migrate, request({ startText: '0' }))).toBeNull();
    });

    it('Dbt-Migrate ve Migration Takip migration adı ister', () => {
        expect(validateRequest(OPERATION_KINDS.dbtMigrate, request())).toBe('Dbt Migrate Name seçilmedi!');
        expect(validateRequest(OPERATION_KINDS.migrationTracking, request())).toBe('Dbt Migrate Name seçilmedi!');
        expect(
            validateRequest(OPERATION_KINDS.dbtMigrate, request({ dbtMigrationName: 'AllFunctions' })),
        ).toBeNull();
    });

    it('Function Renew fonksiyon adı ister', () => {
        expect(validateRequest(OPERATION_KINDS.functionRenew, request())).toContain('Function Name');
        expect(validateRequest(OPERATION_KINDS.functionRenew, request({ functionName: 'x' }))).toBeNull();
    });

    it('Update SalerId tarih aralığı ister ve sırayı kontrol eder', () => {
        expect(validateRequest(OPERATION_KINDS.updateSalerId, request())).toContain('tarihi zorunlu');

        expect(
            validateRequest(
                OPERATION_KINDS.updateSalerId,
                request({ docStartDate: '2026-09-12', docEndDate: '2026-01-01' }),
            ),
        ).toContain('sonra olamaz');

        expect(
            validateRequest(
                OPERATION_KINDS.updateSalerId,
                request({ docStartDate: '2026-01-01', docEndDate: '2026-09-12' }),
            ),
        ).toBeNull();
    });

    it('Migration Geçmişi yalnız Start ister', () => {
        expect(validateRequest(OPERATION_KINDS.migrationHistory, request({ startText: '500292' }))).toBeNull();
    });
});
