import { describe, expect, it } from 'vitest';
import type { ActiveMigrateJob } from '../../operations/types';
import { describeActiveJob, describeTarget, resumeJobItems } from './activeJobs';

function job(patch: Partial<ActiveMigrateJob>): ActiveMigrateJob {
    return {
        jobId: 'j1',
        state: 'Enqueued',
        operation: 'MigrateEfAllAsync',
        packNoStarting: 0,
        packNoEnding: 0,
        migrationId: '',
        createdAtUtc: null,
        startedAtUtc: null,
        serverId: null,
        okCount: 0,
        failCount: 0,
        skippedCount: 0,
        lastPackNo: null,
        elapsed: null,
        message: null,
        ...patch,
    };
}

describe('süren işin hedefi', () => {
    it('0 Dbt_Temp demektir', () => {
        expect(describeTarget(job({ packNoStarting: 0 }))).toBe('Dbt_Temp');
    });

    it('tek paket', () => {
        expect(describeTarget(job({ packNoStarting: 503993 }))).toBe('Dbt_503993');
    });

    it('aralık', () => {
        expect(describeTarget(job({ packNoStarting: 500100, packNoEnding: 500200 }))).toBe(
            'Dbt_500100 - Dbt_500200',
        );
    });

    it('bitiş başlangıca eşitse aralık yazılmaz', () => {
        expect(describeTarget(job({ packNoStarting: 123110, packNoEnding: 123110 }))).toBe('Dbt_123110');
    });
});

describe('süren işin özeti', () => {
    it('koşan iş ilerlemesiyle birlikte yazılır', () => {
        const text = describeActiveJob(
            job({
                state: 'Processing',
                packNoStarting: 500100,
                packNoEnding: 500200,
                okCount: 12,
                failCount: 1,
                skippedCount: 2,
                lastPackNo: 'Dbt_500140',
                elapsed: '00:04:11',
            }),
        );

        expect(text).toBe('koşuyor · Dbt_500100 - Dbt_500200 · 15 paket işlendi · son: Dbt_500140 · 00:04:11');
    });

    it('kuyruktaki iş için ilerleme uydurulmaz', () => {
        expect(describeActiveJob(job({ state: 'Enqueued', packNoStarting: 503993 }))).toBe(
            'kuyrukta · Dbt_503993',
        );
    });

    it('Dbt migration adı varsa yazılır', () => {
        expect(describeActiveJob(job({ packNoStarting: 1, migrationId: 'Oct26_21_01' }))).toContain(
            'Oct26_21_01',
        );
    });
});

describe('devralma', () => {
    it('izleme döngüsünün beklediği biçime çevirir', () => {
        const items = resumeJobItems([
            job({ jobId: 'a', packNoStarting: 500100 }),
            job({ jobId: 'b', packNoStarting: 0 }),
        ]);

        expect(items).toEqual([
            { packNo: '500100', displayName: 'Dbt_500100', jobId: 'a', lineIndex: 0 },
            { packNo: '0', displayName: 'Dbt_Temp', jobId: 'b', lineIndex: 0 },
        ]);
    });
});
