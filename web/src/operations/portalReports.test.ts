import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATION_KINDS, validateRequest, type OperationRequest } from './adminOperations';
import { OperationLog } from './operationLog';
import {
    runPortalDocCounts,
    runPortalEBookUsage,
    type PortalDocCountReport,
    type PortalEBookUsageReport,
} from './portalReports';

const API = 'https://ornek.test/svc/api';

function report(partial: Partial<PortalDocCountReport> = {}): PortalDocCountReport {
    return {
        isOk: true,
        message: null,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        portalTaxpayerCount: 120,
        activeTaxpayerCount: 95,
        incomingDocCount: 400,
        outgoingDocCount: 1500,
        totalDocCount: 1900,
        docTypes: [
            { code: 'GidenEfatura', name: 'e-Fatura', direction: 'Giden', docCount: 1000, taxpayerCount: 80 },
            { code: 'GelenEfatura', name: 'e-Fatura', direction: 'Gelen', docCount: 400, taxpayerCount: 70 },
            { code: 'Earsiv', name: 'e-Arşiv Fatura', direction: 'Giden', docCount: 500, taxpayerCount: 40 },
        ],
        taxpayers: null,
        elapsedMs: 3200,
        ...partial,
    };
}

function run(log: OperationLog, overrides: { token?: string; withTaxpayers?: boolean } = {}) {
    return runPortalDocCounts({
        apiBaseUrl: API,
        log,
        operationName: '9-Portal E-Belge Sayıları',
        token: overrides.token ?? 'lat-token',
        docStartDate: '2026-09-01',
        docEndDate: '2026-09-30',
        withTaxpayers: overrides.withTaxpayers ?? false,
        signal: new AbortController().signal,
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('runPortalDocCounts', () => {
    it('belirteci Bearer olarak gönderir, tarihleri ve detay bayrağını uca taşır', async () => {
        let requested = '';
        let authorization = '';

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                requested = url;
                authorization = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';

                return new Response(JSON.stringify(report()), { status: 200 });
            }),
        );

        const log = new OperationLog();

        await run(log, { withTaxpayers: true });

        expect(requested).toBe(`${API}/UndPortal/etr-doc-counts/2026-09-01/2026-09-30?detail=true`);
        expect(authorization).toBe('Bearer lat-token');

        const snapshot = log.getSnapshot();
        const joined = snapshot.lines.join('\n');

        expect(joined).toContain('Portaldaki mükellef');
        expect(joined).toContain('e-Fatura (Giden)');
        expect(snapshot.state).toBe('succeeded');
        expect(snapshot.counters.success).toBe(1);
    });

    it('mükellef listesini adet etiketleriyle yazar', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify(
                            report({
                                taxpayers: [{ vknTckn: '1234567890', title: 'ÖRNEK A.Ş.', counts: { GidenEfatura: 12 } }],
                            }),
                        ),
                        { status: 200 },
                    ),
            ),
        );

        const log = new OperationLog();

        await run(log, { withTaxpayers: true });

        const joined = log.getSnapshot().lines.join('\n');

        expect(joined).toContain('1234567890');
        expect(joined).toContain('e-Fatura Giden: 12');
    });

    it('403 yanıtında izin listesini işaret eder', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('', { status: 403 })),
        );

        const log = new OperationLog();

        await run(log);

        const snapshot = log.getSnapshot();

        expect(snapshot.errors.join('\n')).toContain('UndPortal:AllowedUsers');
        expect(snapshot.state).toBe('failed');
    });

    it('sunucunun isOk=false gerekçesini hata olarak yazar', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(JSON.stringify(report({ isOk: false, message: 'Portal kullanıcısı bulunamadı' })), {
                        status: 200,
                    }),
            ),
        );

        const log = new OperationLog();

        await run(log);

        expect(log.getSnapshot().errors.join('\n')).toContain('Portal kullanıcısı bulunamadı');
        expect(log.getSnapshot().state).toBe('failed');
    });
});

describe('validateRequest (portal)', () => {
    function request(overrides: Partial<OperationRequest> = {}): OperationRequest {
        return {
            apiBaseUrl: API,
            log: new OperationLog(),
            operationName: 'test',
            startText: '',
            endText: '',
            datNames: null,
            isBetweenMode: false,
            dbtMigrationName: '',
            functionName: '',
            docStartDate: '2026-09-01',
            docEndDate: '2026-09-30',
            onlyMissing: false,
            withTaxpayers: false,
            token: 'lat-token',
            vknText: '',
            signal: new AbortController().signal,
            ...overrides,
        };
    }

    it('paket kutusu boşken de geçer', () => {
        expect(validateRequest(OPERATION_KINDS.portalDocCounts, request())).toBeNull();
    });

    it('tarihleri ve belirteci zorunlu tutar', () => {
        expect(validateRequest(OPERATION_KINDS.portalDocCounts, request({ docStartDate: '' }))).toContain('tarih');
        expect(
            validateRequest(OPERATION_KINDS.portalDocCounts, request({ docStartDate: '2026-10-01' })),
        ).toContain('sonra olamaz');
        expect(validateRequest(OPERATION_KINDS.portalDocCounts, request({ token: '' }))).toContain('belirteci');
    });
});

function usageReport(partial: Partial<PortalEBookUsageReport> = {}): PortalEBookUsageReport {
    return {
        isOk: true,
        message: null,
        startDate: '2026-08-01',
        endDate: '2026-09-30',
        uploadTaxpayerCount: 40,
        uploadCount: 120,
        usedAreaMb: 2048.5,
        eBookTaxpayerCount: 300,
        months: [
            {
                month: '2026-08',
                startDate: '2026-08-01',
                endDate: '2026-08-31',
                uploadCount: 70,
                uploadTaxpayerCount: 30,
                usedAreaMb: 1024,
                areaTaxpayerCount: 28,
            },
            {
                month: '2026-09',
                startDate: '2026-09-01',
                endDate: '2026-09-30',
                uploadCount: 50,
                uploadTaxpayerCount: 25,
                usedAreaMb: 1024.5,
                areaTaxpayerCount: 22,
            },
        ],
        taxpayers: null,
        elapsedMs: 41000,
        ...partial,
    };
}

function usageRequest(log: OperationLog, withTaxpayers = false) {
    return {
        apiBaseUrl: API,
        log,
        operationName: '10-Portal E-Defter Kullanımı',
        token: 'lat-token',
        docStartDate: '2026-08-01',
        docEndDate: '2026-09-30',
        withTaxpayers,
        signal: new AbortController().signal,
    };
}

describe('runPortalEBookUsage', () => {
    it('belirteçle tek GET atar ve ay satırlarını yazar', async () => {
        let requested = '';
        let authorization = '';

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                requested = url;
                authorization = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';

                return new Response(JSON.stringify(usageReport()), { status: 200 });
            }),
        );

        const log = new OperationLog();

        await runPortalEBookUsage(usageRequest(log, true));

        expect(requested).toBe(`${API}/UndPortal/ebook-usage/2026-08-01/2026-09-30?detail=true`);
        expect(authorization).toBe('Bearer lat-token');

        const snapshot = log.getSnapshot();
        const joined = snapshot.lines.join('\n');

        expect(joined).toContain('Defter yükleme adedi');
        expect(joined).toContain('2026-08');
        expect(joined).toContain('2026-09');
        expect(snapshot.state).toBe('succeeded');
    });

    it('okunamayan ayı rapora yazar ama işlemi hatalı sayar', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify(
                            usageReport({
                                months: [
                                    {
                                        month: '2026-09',
                                        startDate: '2026-09-01',
                                        endDate: '2026-09-30',
                                        uploadCount: 0,
                                        uploadTaxpayerCount: 0,
                                        usedAreaMb: 0,
                                        areaTaxpayerCount: 0,
                                        error: 'yükleme adedi okunamadı: zaman aşımı',
                                    },
                                ],
                            }),
                        ),
                        { status: 200 },
                    ),
            ),
        );

        const log = new OperationLog();

        await runPortalEBookUsage(usageRequest(log));

        const snapshot = log.getSnapshot();

        expect(snapshot.lines.join('\n')).toContain('(eksik)');
        expect(snapshot.errors.join('\n')).toContain('2026-09: yükleme adedi okunamadı');
        expect(snapshot.state).toBe('failed');
    });

    it('mükellef listesini yazar', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify(
                            usageReport({
                                taxpayers: [{ vknTckn: '1234567890', title: 'ÖRNEK A.Ş.', uploadCount: 3, usedAreaMb: 12.5, areaMb: 500 }],
                            }),
                        ),
                        { status: 200 },
                    ),
            ),
        );

        const log = new OperationLog();

        await runPortalEBookUsage(usageRequest(log, true));

        const joined = log.getSnapshot().lines.join('\n');

        expect(joined).toContain('1234567890');
        expect(joined).toContain('yükleme: 3');
    });

    it('e-Defter işleminde de tarih ve belirteç zorunlu, paket kutusu değil', () => {
        const base = {
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

        expect(validateRequest(OPERATION_KINDS.portalEBookUsage, base)).toBeNull();
        expect(validateRequest(OPERATION_KINDS.portalEBookUsage, { ...base, docEndDate: '' })).toContain('tarih');
        expect(validateRequest(OPERATION_KINDS.portalEBookUsage, { ...base, token: '' })).toContain('belirteci');
    });
});
