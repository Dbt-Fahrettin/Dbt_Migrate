import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPurgeJob, startPurgeJob, stopPurgeJob } from './gibPurge';
import type { XmlPurgeJobState } from './gibPurge';
import { describeGibFailure } from './gibClient';
import { gibEndpoints } from './endpoints';

const GIB = 'https://hw.unideva.com/gib/api';
const TOKEN = 'sahte-belirtec';

function jobState(): XmlPurgeJobState {
    return {
        purgeEnabled: true,
        readEnabled: true,
        storeOnly: true,
        walBacklogMb: 12,
        walBacklogError: null,
        control: {
            isEnabled: true,
            batchSize: 50,
            pauseMs: 1000,
            maxWalBacklogMb: 2048,
            cursorBeforeCounter: 2_611_000,
            leaseOwner: 'und-gib-deployment-abc',
            batchCount: 120,
            clearedCount: 5980,
            freedBytes: 650_000_000,
        },
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('gibEndpoints (purge)', () => {
    it('GibXmlStore yollarını kurar', () => {
        expect(gibEndpoints.purgeJob(GIB)).toBe('https://hw.unideva.com/gib/api/GibXmlStore/purge-job');
        expect(gibEndpoints.startPurgeJob(GIB)).toBe('https://hw.unideva.com/gib/api/GibXmlStore/purge-job/start');
        expect(gibEndpoints.stopPurgeJob(GIB)).toBe('https://hw.unideva.com/gib/api/GibXmlStore/purge-job/stop');
    });
});

describe('getPurgeJob', () => {
    it('Bearer başlığıyla GET atar ve durumu çözer', async () => {
        let seenUrl = '';
        let seenInit: RequestInit | undefined;

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                seenUrl = url;
                seenInit = init;

                return new Response(JSON.stringify(jobState()), { status: 200 });
            }),
        );

        const result = await getPurgeJob(GIB, TOKEN);

        expect(seenUrl).toContain('GibXmlStore/purge-job');
        expect(seenInit?.method).toBe('GET');
        expect((seenInit?.headers as Record<string, string>)?.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(result.data?.control.clearedCount).toBe(5980);
    });
});

describe('startPurgeJob', () => {
    it('gövdeyi olduğu gibi gönderir - restart dahil', async () => {
        let seenBody = '';
        let seenUrl = '';

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                seenUrl = url;
                seenBody = String(init?.body);

                return new Response(JSON.stringify(jobState()), { status: 200 });
            }),
        );

        await startPurgeJob(GIB, TOKEN, { batchSize: 50, pauseMs: 1000, maxWalBacklogMb: 2048, restart: true });

        expect(seenUrl).toContain('purge-job/start');
        expect(JSON.parse(seenBody)).toEqual({
            batchSize: 50,
            pauseMs: 1000,
            maxWalBacklogMb: 2048,
            restart: true,
        });
    });
});

describe('stopPurgeJob', () => {
    it('boş gövdeyle POST atar', async () => {
        let seenUrl = '';
        let seenBody = '';

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                seenUrl = url;
                seenBody = String(init?.body);

                return new Response(JSON.stringify(jobState()), { status: 200 });
            }),
        );

        await stopPurgeJob(GIB, TOKEN);

        expect(seenUrl).toContain('purge-job/stop');
        expect(JSON.parse(seenBody)).toEqual({});
    });
});

describe('describeGibFailure (purge durumları)', () => {
    const fail = (status: number, content = '', error = '') => ({
        isSuccess: false,
        status,
        content,
        data: null,
        error,
    });

    /**
     * Korumalı uçlar kimliksiz çağrıda 401 döner; 404 "yol yok" demektir, yani sunucudaki
     * sürüm bu ucu henüz içermiyor. Yayın beklenirken doğru teşhis bu ayrımdan geliyor.
     */
    it('404ü "sunucu sürümü bu ucu içermiyor" diye açıklar', () => {
        expect(describeGibFailure(fail(404))).toContain('404');
        expect(describeGibFailure(fail(404))).toContain('yayını bekleniyor');
    });

    it('409da sunucunun düz metin gerekçesini gösterir', () => {
        const message = 'GibXmlStore:PurgeEnabled ve ReadEnabled açık olmadan boşaltma işi açılamaz.';

        expect(describeGibFailure(fail(409, message))).toBe(message);
    });

    it('409 gövdesi boşsa genel mesaja düşer', () => {
        expect(describeGibFailure(fail(409, '   '))).toContain('409');
    });

    it('401 ve 403 davranışı değişmedi', () => {
        expect(describeGibFailure(fail(401))).toContain('süresi dolmuş');
        expect(describeGibFailure(fail(403))).toContain('403');
    });
});
