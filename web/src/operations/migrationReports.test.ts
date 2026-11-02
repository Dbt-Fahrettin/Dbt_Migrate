import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationLog } from './operationLog';
import {
    formatDuration,
    formatHistoryLine,
    formatPackRanges,
    formatPackStateLine,
    getTrackingRange,
    runMigrationHistory,
    runMigrationTracking,
    runRangeTracking,
    trackingPrefixes,
    type MigrationHistoryItem,
    type MigrationPackState,
} from './migrationReports';

const API = 'https://ornek.test/svc/api';

function historyItem(partial: Partial<MigrationHistoryItem> = {}): MigrationHistoryItem {
    return {
        migrationId: '20260910160000_SuitSMrpPlans',
        lastAppliedAt: '2026-09-10T16:05:09',
        isOk: true,
        runCount: 1,
        failCount: 0,
        durationMs: 2400,
        stepCount: 0,
        stepFailCount: 0,
        triggerKind: 'manual',
        appliedBy: 'fahrettin',
        message: '',
        ...partial,
    };
}

function packState(partial: Partial<MigrationPackState> = {}): MigrationPackState {
    return {
        packNo: '500292',
        migrationId: 'AllFunctions',
        isTracked: true,
        isApplied: true,
        isOk: true,
        lastAppliedAt: '2026-09-07T10:23:45',
        runCount: 1,
        failCount: 0,
        triggerKind: 'deploy',
        message: '',
        error: '',
        ...partial,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('formatDuration', () => {
    it('saniyeye çevirir, altında ms bırakır, sıfırda tire koyar', () => {
        expect(formatDuration(2400)).toBe('2.4 sn');
        expect(formatDuration(950)).toBe('950 ms');
        expect(formatDuration(0)).toBe('-');
    });
});

describe('formatHistoryLine', () => {
    it('başarılı kaydı OK olarak yazar', () => {
        const line = formatHistoryLine(historyItem());

        expect(line).toContain('--> OK');
        expect(line).toContain('manual');
        expect(line).toContain('10.09.2026 16:05:09');
        expect(line).toContain('2.4 sn');
        expect(line).toContain('fahrettin');
    });

    it('adım, koşu ve hata sayılarını yalnız anlamlıysa ekler', () => {
        const plain = formatHistoryLine(historyItem());

        expect(plain).not.toContain('adım:');
        expect(plain).not.toContain('koşu:');

        const rich = formatHistoryLine(
            historyItem({ isOk: false, stepCount: 10, stepFailCount: 2, runCount: 3, failCount: 1, message: 'x' }),
        );

        expect(rich).toContain('--> HATA');
        expect(rich).toContain('adım: 8/10');
        expect(rich).toContain('koşu: 3');
        expect(rich).toContain('hatalı koşu: 1');
        expect(rich).toContain('-> x');
    });
});

describe('formatPackStateLine', () => {
    it('Temp paketini Dbt_Temp olarak gösterir', () => {
        expect(formatPackStateLine(packState({ packNo: 'Temp' }))).toContain('Dbt_Temp');
    });

    it('okuma hatasını her şeyin önüne alır', () => {
        const line = formatPackStateLine(packState({ error: 'connection refused', isTracked: false }));

        expect(line).toContain('OKUNAMADI -> connection refused');
    });

    it('takip edilmeyen ve uygulanmayan paketleri ayırır', () => {
        expect(formatPackStateLine(packState({ isTracked: false }))).toContain(
            'TAKİP YOK (MigrationHistoryInit koşturulmalı)',
        );
        expect(formatPackStateLine(packState({ isApplied: false }))).toContain('UYGULANMADI');
    });

    it('hatalı ve başarılı uygulamayı ayırır', () => {
        expect(formatPackStateLine(packState({ isOk: false, failCount: 2 }))).toContain('HATALI');
        expect(formatPackStateLine(packState())).toContain('uygulandı');
    });
});

describe('runMigrationHistory', () => {
    it('kayıtları listeler ve hatalı olanları hata sekmesine taşır', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(JSON.stringify([historyItem(), historyItem({ isOk: false })]), { status: 200 }),
            ),
        );

        const log = new OperationLog();

        await runMigrationHistory({
            apiBaseUrl: API,
            log,
            operationName: '7-Migration Geçmişi',
            startText: '500292',
            dbtMigrationName: '',
            onlyMissing: false,
        });

        const snapshot = log.getSnapshot();

        expect(snapshot.counters.queued).toBe(2);
        expect(snapshot.counters.success).toBe(1);
        expect(snapshot.counters.error).toBe(1);
        expect(snapshot.errors).toHaveLength(1);
        expect(snapshot.state).toBe('failed');
    });

    it('boş yanıtta MigrationHistoryInit çözümünü önerir', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('[]', { status: 200 })),
        );

        const log = new OperationLog();

        await runMigrationHistory({
            apiBaseUrl: API,
            log,
            operationName: '7-Migration Geçmişi',
            startText: '0',
            dbtMigrationName: '',
            onlyMissing: false,
        });

        const joined = log.getSnapshot().lines.join('\n');

        expect(joined).toContain('Dbt_Temp --> takip kaydı yok');
        expect(joined).toContain('MigrationHistoryInit');
        expect(log.getSnapshot().state).toBe('succeeded');
    });
});

describe('runMigrationTracking', () => {
    it('onlyMissing bayrağını uca taşır ve uygulanmış/eksik ayrımı yapar', async () => {
        let requested = '';

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                requested = url;

                return new Response(
                    JSON.stringify([packState(), packState({ packNo: '500494', isApplied: false })]),
                    { status: 200 },
                );
            }),
        );

        const log = new OperationLog();

        await runMigrationTracking({
            apiBaseUrl: API,
            log,
            operationName: '8-Migration Takip',
            startText: '5',
            dbtMigrationName: 'AllFunctions',
            onlyMissing: true,
        });

        const snapshot = log.getSnapshot();

        expect(requested).toContain('master/dbt-migration-packs/5/AllFunctions?onlyMissing=true');
        expect(snapshot.counters.success).toBe(1);
        expect(snapshot.counters.error).toBe(1);
    });

    it('onlyMissing açıkken boş sonucu "hepsi uygulanmış" olarak yorumlar', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('[]', { status: 200 })),
        );

        const log = new OperationLog();

        await runMigrationTracking({
            apiBaseUrl: API,
            log,
            operationName: '8-Migration Takip',
            startText: '5',
            dbtMigrationName: 'AllFunctions',
            onlyMissing: true,
        });

        expect(log.getSnapshot().lines.join('\n')).toContain('hepsi uygulanmış');
    });
});

describe('getTrackingRange / trackingPrefixes / formatPackRanges', () => {
    it('yalnız 6 haneli Start ve End ≥ Start aralık sayılır', () => {
        expect(getTrackingRange('500000', '504945')).toEqual({ start: 500000, end: 504945 });
        expect(getTrackingRange('5', '')).toBeNull();
        expect(getTrackingRange('0', '500000')).toBeNull();
        expect(getTrackingRange('500100', '500000')).toBeNull();
        expect(getTrackingRange('500000', undefined)).toBeNull();
    });

    it('aralığı yüzlük blok öneklerine böler', () => {
        expect(trackingPrefixes(500000, 500250)).toEqual([5000, 5001, 5002]);
        expect(trackingPrefixes(500050, 500050)).toEqual([5000]);
    });

    it('ardışık paketleri aralık olarak, Temp paketini ad olarak yazar', () => {
        expect(formatPackRanges(['500004', '500000', '500001', '500002', 'Temp'])).toBe('Dbt_Temp, 500000-500002, 500004');
    });
});

describe('runRangeTracking', () => {
    const base = {
        apiBaseUrl: API,
        operationName: '8-Migration Takip',
        startText: '500050',
        endText: '500150',
        dbtMigrationName: 'ModelIndexes',
        onlyMissing: false,
        start: 500050,
        end: 500150,
        appendOnly: false,
    };

    function stubChunks(): string[] {
        const requested: string[] = [];

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                requested.push(url);

                const failing = 'IX_bank_match_rules_company_id: 42P01: relation does not exist';
                const body = url.includes('/5000/')
                    ? [
                          packState({ packNo: '500010' }), // aralık dışı: atılır
                          packState({ packNo: '500050', isOk: false, message: failing }),
                          packState({ packNo: '500051', isOk: false, message: failing }),
                          packState({ packNo: '500052' }),
                      ]
                    : [
                          packState({ packNo: '500100', isOk: false, message: failing }),
                          packState({ packNo: '500151' }), // aralık dışı: atılır
                      ];

                return new Response(JSON.stringify(body), { status: 200 });
            }),
        );

        return requested;
    }

    it('blokları sırayla okur, aralık dışını atar, aynı hatayı tek satırda gruplar', async () => {
        const requested = stubChunks();
        const log = new OperationLog();

        await runRangeTracking({ ...base, log });

        const snapshot = log.getSnapshot();
        const joined = snapshot.lines.join('\n');

        expect(requested).toHaveLength(2);
        expect(requested[0]).toContain('master/dbt-migration-packs/5000/ModelIndexes?onlyMissing=false');
        expect(requested[1]).toContain('master/dbt-migration-packs/5001/ModelIndexes?onlyMissing=false');
        expect(joined).toContain('Toplam paket        : 4');
        expect(joined).toContain('Tamam (son koşu OK) : 1');
        expect(joined).toContain('Hatalı bitti        : 3');
        expect(joined).toContain('Tamam paketler: 500052');
        expect(snapshot.errors[0]).toBe('HATALI - 3 paket: 500050-500051, 500100');
        expect(snapshot.errors[1]).toContain('IX_bank_match_rules_company_id');
        expect(snapshot.counters.success).toBe(1);
        expect(snapshot.counters.error).toBe(3);
        expect(snapshot.state).toBe('failed');
    });

    it('appendOnly iken işin sayaç ve durumuna dokunmaz', async () => {
        stubChunks();
        const log = new OperationLog();

        log.setStatus('1-Dbt-Migrate - Tamamlandı', 'succeeded');
        log.setOperation('iş satırı');

        await runRangeTracking({ ...base, log, appendOnly: true });

        const snapshot = log.getSnapshot();

        expect(snapshot.state).toBe('succeeded');
        expect(snapshot.statusText).toBe('1-Dbt-Migrate - Tamamlandı');
        expect(snapshot.operation).toBe('iş satırı');
        expect(snapshot.counters.queued).toBe(0);
        expect(snapshot.errors.length).toBeGreaterThan(0);
    });

    it('okunamayan bloğu hata olarak yazar ve diğer blokla devam eder', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) =>
                url.includes('/5000/')
                    ? new Response('boom', { status: 500 })
                    : new Response(JSON.stringify([packState({ packNo: '500100' })]), { status: 200 }),
            ),
        );

        const log = new OperationLog();

        await runRangeTracking({ ...base, log });

        const snapshot = log.getSnapshot();

        expect(snapshot.errors[0]).toContain('5000* okunamadı');
        expect(snapshot.counters.success).toBe(1);
        expect(snapshot.state).toBe('failed');
    });

    it('runMigrationTracking End doluysa aralık taramasına geçer', async () => {
        const requested = stubChunks();
        const log = new OperationLog();

        await runMigrationTracking({
            apiBaseUrl: API,
            log,
            operationName: '8-Migration Takip',
            startText: '500050',
            endText: '500150',
            dbtMigrationName: 'ModelIndexes',
            onlyMissing: false,
        });

        expect(requested).toHaveLength(2);
        expect(log.getSnapshot().lines.join('\n')).toContain('Takip tamamlandı - ModelIndexes');
    });
});
