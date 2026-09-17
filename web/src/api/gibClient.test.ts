import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeGibFailure, getNightlyState, setNightlyState } from './gibClient';
import type { NightlyQueryState } from './gibClient';
import { gibEndpoints } from './endpoints';

const GIB = 'https://test.unideva.com/gib/api';
const TOKEN = 'sahte-belirtec';

function state(partial: Partial<NightlyQueryState> = {}): NightlyQueryState {
    return {
        isEnabled: true,
        autoStartEnabled: false,
        isWithinExecutionWindow: true,
        activeQueryDate: '2026-09-16T00:00:00',
        lastCounter: 4211,
        updatedAtUtc: '2026-09-17T09:12:00Z',
        ...partial,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('gibEndpoints', () => {
    it('Gib.Api yollarını controller adına göre kurar', () => {
        expect(gibEndpoints.nightlyState(GIB)).toBe(
            'https://test.unideva.com/gib/api/GibInvoiceQuery/GetNightlyQueryState',
        );
        expect(gibEndpoints.setNightlyState(GIB)).toBe(
            'https://test.unideva.com/gib/api/GibInvoiceQuery/SetNightlyQueryState',
        );
    });

    it('sondaki eğik çizgiyi yutar', () => {
        expect(gibEndpoints.nightlyState('https://x/gib/api/')).toBe(
            'https://x/gib/api/GibInvoiceQuery/GetNightlyQueryState',
        );
    });
});

describe('getNightlyState', () => {
    it('Authorization başlığını Bearer olarak gönderir', async () => {
        let seenInit: RequestInit | undefined;

        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, init?: RequestInit) => {
                seenInit = init;

                return new Response(JSON.stringify(state()), { status: 200 });
            }),
        );

        const result = await getNightlyState(GIB, TOKEN);

        expect(result.isSuccess).toBe(true);
        expect(result.data?.isEnabled).toBe(true);
        expect((seenInit?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('belirteç yoksa Authorization başlığı eklemez', async () => {
        let seenInit: RequestInit | undefined;

        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, init?: RequestInit) => {
                seenInit = init;

                return new Response(JSON.stringify(state()), { status: 200 });
            }),
        );

        await getNightlyState(GIB, '');

        expect((seenInit?.headers as Record<string, string>)?.Authorization).toBeUndefined();
    });
});

describe('setNightlyState', () => {
    it('yalnız isEnabled gönderir - AutoStartEnabled ayarına dokunmaz', async () => {
        let seenBody = '';
        let seenUrl = '';

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                seenUrl = url;
                seenBody = String(init?.body);

                return new Response(JSON.stringify(state({ isEnabled: false })), { status: 200 });
            }),
        );

        const result = await setNightlyState(GIB, TOKEN, false);

        expect(seenUrl).toContain('SetNightlyQueryState');
        expect(JSON.parse(seenBody)).toEqual({ isEnabled: false });
        expect(result.data?.isEnabled).toBe(false);
    });
});

describe('describeGibFailure', () => {
    const fail = (status: number, error = '') => ({
        isSuccess: false,
        status,
        content: '',
        data: null,
        error,
    });

    it('401i belirteç süresi olarak açıklar - bu uçlar [Authorize] altında', () => {
        expect(describeGibFailure(fail(401))).toContain('süresi dolmuş');
    });

    it('403ü yetki yetersizliği olarak ayırır', () => {
        expect(describeGibFailure(fail(403))).toContain('403');
        expect(describeGibFailure(fail(403))).not.toContain('süresi dolmuş');
    });

    it('diğer hatalarda ham mesajı geçirir', () => {
        expect(describeGibFailure(fail(500, 'Status Code: 500 -- patladi'))).toContain('patladi');
        expect(describeGibFailure(fail(0))).toContain('Status Code: 0');
    });
});
