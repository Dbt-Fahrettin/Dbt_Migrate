import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATION_KINDS, validateRequest, type OperationRequest } from './adminOperations';
import { OperationLog } from './operationLog';
import {
    buildPeriodSummary,
    buildUsageCsv,
    parseVknList,
    runEBelgeScan,
    runPortalRestEBookScan,
    runPortalRestScan,
    runEBookScan,
    runUsageReport,
    type PortalScanJobStatus,
    type PortalUsageRequest,
    type PortalUsageRow,
} from './portalUsage';

const API = 'https://ornek.test/svc/api';

function usageRequest(log: OperationLog, overrides: Partial<PortalUsageRequest> = {}): PortalUsageRequest {
    return {
        apiBaseUrl: API,
        log,
        operationName: 'test',
        token: 'lat-token',
        docStartDate: '2026-08-15',
        docEndDate: '2026-09-03',
        vknText: '',
        withTaxpayers: false,
        signal: new AbortController().signal,
        pollIntervalMs: 1,
        ...overrides,
    };
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

function row(partial: Partial<PortalUsageRow> = {}): PortalUsageRow {
    return {
        vknTckn: '0123456789',
        vkn: '0123456789',
        tckn: null,
        title: 'Örnek; A.Ş.',
        docType: 20,
        year: 2026,
        month: 8,
        docCount: 4,
        sizeMb: 1.5,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        status: 'GİB onaylı',
        error: null,
        scannedAt: '2026-10-08T18:00:00+00:00',
        ...partial,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('runEBookScan', () => {
    it('ayları yyyy-MM gönderir, VKN listesini gövdeye koyar ve iş bitene kadar izler', async () => {
        const calls: { url: string; method: string; body: string | null }[] = [];
        const statuses: PortalScanJobStatus[] = [
            { jobId: '42', isFound: true, state: 'Processing', isFinished: false, progress: null },
            {
                jobId: '42',
                isFound: true,
                state: 'Succeeded',
                isFinished: true,
                progress: {
                    isDone: true,
                    phase: 'Bitti',
                    taxpayerCount: 2,
                    processedCount: 2,
                    failedCount: 1,
                    rowsWritten: 5,
                    elapsed: '00:00:09',
                    message: '2 mükellef tarandı, 5 satır yazıldı (hata: 1).',
                    failures: ['*******789 Örnek: Portal hatası: yetkisiz'],
                },
            },
        ];

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                calls.push({ url, method: init?.method ?? 'GET', body: (init?.body as string) ?? null });

                if (url.includes('ebook-scan')) {
                    return json({ jobId: '42', isFound: true, state: 'Enqueued', isFinished: false });
                }

                return json(statuses.shift());
            }),
        );

        const log = new OperationLog();

        await runEBookScan(usageRequest(log, { vknText: '0123456789, 12345678901' }));
        log.flushNow();

        expect(calls[0].url).toBe(`${API}/UndPortal/ebook-scan/2026-08/2026-09`);
        expect(calls[0].method).toBe('POST');
        expect(JSON.parse(calls[0].body ?? '[]')).toEqual(['0123456789', '12345678901']);
        expect(calls[1].url).toBe(`${API}/UndPortal/scan-status/42`);
        expect(calls).toHaveLength(3);

        const snapshot = log.getSnapshot();
        expect(snapshot.lines.join('\n')).toContain('5 satır yazıldı');
        expect(snapshot.errors.join('\n')).toContain('yetkisiz');
        expect(snapshot.state).toBe('succeeded');
    });

    it('e-belge taraması kendi ucunu çağırır, aynı durum ucuyla izler', async () => {
        const urls: string[] = [];

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                urls.push(url);

                return url.includes('ebelge-scan')
                    ? json({ jobId: '9', isFound: true, state: 'Enqueued', isFinished: false })
                    : json({ jobId: '9', isFound: true, state: 'Succeeded', isFinished: true, progress: null });
            }),
        );

        const log = new OperationLog();

        await runEBelgeScan(usageRequest(log));
        log.flushNow();

        expect(urls[0]).toBe(`${API}/UndPortal/ebelge-scan/2026-08/2026-09`);
        expect(urls[1]).toBe(`${API}/UndPortal/scan-status/9`);
        expect(log.getSnapshot().lines.join(' ')).toContain('e-belge web servis kullanıcıları');
    });

    it('bayi taraması kendi ucunu çağırır, aynı durum ucuyla izler', async () => {
        const urls: string[] = [];

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                urls.push(url);

                return url.includes('portal-ebelge-scan')
                    ? json({ jobId: '11', isFound: true, state: 'Enqueued', isFinished: false })
                    : json({ jobId: '11', isFound: true, state: 'Succeeded', isFinished: true, progress: null });
            }),
        );

        const log = new OperationLog();

        await runPortalRestScan(usageRequest(log));
        log.flushNow();

        expect(urls[0]).toBe(`${API}/UndPortal/portal-ebelge-scan/2026-08/2026-09`);
        expect(urls[1]).toBe(`${API}/UndPortal/scan-status/11`);
        expect(log.getSnapshot().lines.join(' ')).toContain('bayinin portaldaki aktif müşterileri');
    });

    it('bayi e-Defter taraması kendi ucunu çağırır', async () => {
        const urls: string[] = [];

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                urls.push(url);

                return url.includes('portal-ebook-scan')
                    ? json({ jobId: '12', isFound: true, state: 'Enqueued', isFinished: false })
                    : json({ jobId: '12', isFound: true, state: 'Succeeded', isFinished: true, progress: null });
            }),
        );

        const log = new OperationLog();

        await runPortalRestEBookScan(usageRequest(log));
        log.flushNow();

        expect(urls[0]).toBe(`${API}/UndPortal/portal-ebook-scan/2026-08/2026-09`);
        expect(log.getSnapshot().operation).toContain('Portal E-Defter Taraması (bayi)');
        expect(log.getSnapshot().lines.join(' ')).toContain('tümü (bayinin portaldaki aktif müşterileri)');
    });

    it('işi başlatamazsa 403 gerekçesini yazar', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));

        const log = new OperationLog();

        await runEBookScan(usageRequest(log));
        log.flushNow();

        expect(log.getSnapshot().errors.join('\n')).toContain('AllowedUsers');
        expect(log.getSnapshot().state).toBe('failed');
    });

    it('Durdur izlemeyi bırakır, iş sunucuda sürer', async () => {
        const controller = new AbortController();

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                if (url.includes('ebook-scan')) {
                    controller.abort();

                    return json({ jobId: '7', isFound: true, state: 'Enqueued', isFinished: false });
                }

                return json({ jobId: '7', isFound: true, state: 'Processing', isFinished: false });
            }),
        );

        const log = new OperationLog();

        await runEBookScan(usageRequest(log, { signal: controller.signal }));
        log.flushNow();

        expect(log.getSnapshot().lines.join('\n')).toContain('İzleme durduruldu');
    });
});

describe('runUsageReport', () => {
    it('ay ay toplar ve satırları Excel dosyası olarak indirir', async () => {
        const urls: string[] = [];

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                urls.push(url);

                return json([
                    row(),
                    row({ month: 9, sizeMb: 2.25, docCount: 6, periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
                    row({ vknTckn: '12345678901', vkn: null, tckn: '12345678901', sizeMb: 0.25, docCount: 2 }),
                ]);
            }),
        );

        const downloads: { name: string; content: string }[] = [];
        const log = new OperationLog();

        await runUsageReport(
            usageRequest(log, {
                vknText: '0123456789 12345678901',
                withTaxpayers: true,
                download: (name, content) => downloads.push({ name, content }),
            }),
        );
        log.flushNow();

        // Rapor yalnız bayi taramasının satırlarını ister (source=1).
        expect(urls[0]).toBe(`${API}/UndPortal/usage-report/2026-08/2026-09?source=1&vkns=0123456789%2C12345678901`);

        const text = log.getSnapshot().lines.join('\n');
        expect(text).toContain('e-Defter');
        expect(text).toContain('2026-08');
        expect(text).toContain('1,75 MB');
        expect(text).toContain('4 MB');

        expect(downloads).toHaveLength(1);
        expect(downloads[0].name).toBe('portal-kullanim-2026-08_2026-09.csv');
        expect(log.getSnapshot().state).toBe('succeeded');
    });

    it('boş dönemde taramayı önerir', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json([])));

        const log = new OperationLog();
        const download = vi.fn();

        await runUsageReport(usageRequest(log, { download }));
        log.flushNow();

        expect(log.getSnapshot().lines.join('\n')).toContain('14-Portal E-Belge');
        expect(download).not.toHaveBeenCalled();
    });
});

describe('buildUsageCsv', () => {
    it('BOM, noktalı virgül, ondalık virgül; VKN baştaki sıfırı korur; ayraçlı unvan tırnaklanır', () => {
        const csv = buildUsageCsv([row()]);
        const lines = csv.split('\r\n');

        expect(csv.startsWith('﻿')).toBe(true);
        expect(lines[0]).toContain('VKN/TCKN;VKN;TCKN;Unvan');
        expect(lines[1]).toContain('"=""0123456789"""');
        expect(lines[1]).toContain('"Örnek; A.Ş."');
        expect(lines[1]).toContain(';1,5;');
        expect(lines[1]).toContain('e-Defter');
    });
});

describe('dönem özeti', () => {
    const rows = [
        row({ docType: 2, docCount: 600, sizeMb: null }),
        row({ docType: 1, docCount: 50, sizeMb: null, month: 9 }),
        row({ docType: 3, docCount: 150, sizeMb: null }),
        row({ docType: 5, docCount: 190, sizeMb: null }),
        row({ docType: 8, docCount: 4, sizeMb: null }),
        row({ docType: 9, docCount: 6, sizeMb: null }),
        row({ docType: 20, docCount: 4, sizeMb: 1024 }),
        row({ docType: 20, docCount: 4, sizeMb: 512, month: 9 }),
    ];

    it('aileleri birleştirir, oranları toplam belgeye göre verir, e-Defter boyutunu ayrı toplar', () => {
        const summary = buildPeriodSummary(rows);

        expect(summary.totalDocs).toBe(1000);
        expect(summary.families.map((f) => [f.name, f.count, f.percent])).toEqual([
            ['E-Fatura', 650, 65],
            ['E-Arşiv', 150, 15],
            ['E-İrsaliye', 190, 19],
            ['E-SMM', 4, 0.4],
            ['E-Müstahsil', 6, 0.6],
        ]);
        expect(summary.eBookMb).toBe(1536);
    });

    it('Excel dosyasının altına özet satırlarını ekler', () => {
        const lines = buildUsageCsv(rows).trimEnd().split('\r\n');

        expect(lines.slice(-3)).toEqual([
            'Dönem Özeti;E-Fatura;E-Arşiv;E-İrsaliye;E-SMM;E-Müstahsil;Toplam Belge;E-Defter MB;E-Defter GB',
            'Adet;650;150;190;4;6;1000;1536,00;1,50',
            'Oran %;65,00;15,00;19,00;0,40;0,60;100,00',
        ]);
        expect(lines[lines.length - 4]).toBe('');
    });

    it('konsol çıktısına dönem özetini yazar', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json(rows)));

        const log = new OperationLog();

        await runUsageReport(usageRequest(log, { download: () => {} }));
        log.flushNow();

        const text = log.getSnapshot().lines.join('\n');
        expect(text).toContain('Dönem özeti');
        // Sütunlar sekmeyle ayrılır (konsolda hizalı, Excel'e yapıştırınca hücrelere bölünür).
        expect(log.getSnapshot().lines).toContain('E-Fatura	650	%65,00');
        expect(log.getSnapshot().lines).toContain('Toplam belge	1.000	%100,00');
        expect(text).toContain('%65,00');
        expect(text).toContain('1,50 GB');
    });
});

describe('VKN listesi', () => {
    it('virgül/boşluk/noktalı virgülle ayırır, tekrarı atar', () => {
        expect(parseVknList(' 0123456789,0123456789;\n12345678901 ')).toEqual(['0123456789', '12345678901']);
    });

    it('geçersiz VKN doğrulamada reddedilir', () => {
        const base: OperationRequest = {
            apiBaseUrl: API,
            log: new OperationLog(),
            operationName: 'test',
            startText: '',
            endText: '',
            datNames: null,
            isBetweenMode: false,
            dbtMigrationName: '',
            functionName: '',
            docStartDate: '2026-08-01',
            docEndDate: '2026-09-30',
            onlyMissing: false,
            withTaxpayers: false,
            token: 'lat-token',
            vknText: '',
            signal: new AbortController().signal,
        };

        expect(validateRequest(OPERATION_KINDS.portalEBookScan, base)).toBeNull();
        expect(validateRequest(OPERATION_KINDS.portalEBookScan, { ...base, vknText: '12ab' })).toContain('10 ya da 11');
        expect(validateRequest(OPERATION_KINDS.portalUsageReport, { ...base, token: '' })).toContain('belirteci');
    });
});
