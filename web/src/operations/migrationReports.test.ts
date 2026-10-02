import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationLog } from './operationLog';
import {
    formatDuration,
    formatHistoryLine,
    formatPackStateLine,
    runMigrationHistory,
    runMigrationTracking,
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
