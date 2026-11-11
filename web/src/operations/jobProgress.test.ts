import { describe, expect, it } from 'vitest';
import {
    doneCount,
    estimatedRemainingMs,
    formatDuration,
    formatEta,
    isFinishedState,
    percentDone,
    remainingCount,
} from './jobProgress';
import type { JobProgress } from './types';

function job(patch: Partial<JobProgress>): JobProgress {
    return {
        jobId: 'j1',
        displayName: 'Dbt_500000 - Dbt_502498 (aralık, 1330 db)',
        state: 'Processing',
        total: 0,
        okCount: 0,
        failCount: 0,
        skippedCount: 0,
        message: '',
        elapsedMs: 0,
        ...patch,
    };
}

describe('ilerleme sayıları', () => {
    it('işlenen = tamam + hata + atlanan', () => {
        expect(doneCount(job({ okCount: 10, failCount: 2, skippedCount: 3 }))).toBe(15);
    });

    it('toplam bilinmiyorsa kalan ve yüzde üretilmez', () => {
        const unknown = job({ total: 0, okCount: 5 });

        expect(remainingCount(unknown)).toBeNull();
        expect(percentDone(unknown)).toBeNull();
    });

    it('kalan negatife düşmez - sunucu beklenenden fazla sayarsa', () => {
        expect(remainingCount(job({ total: 10, okCount: 12 }))).toBe(0);
    });

    it('yüzde 100ü aşmaz', () => {
        expect(percentDone(job({ total: 10, okCount: 12 }))).toBe(100);
    });
});

describe('tahmini kalan süre', () => {
    it('hiç veritabanı bitmemişken tahmin üretilmez', () => {
        // Tek örnekten yapılan tahmin yanıltıcı olurdu.
        expect(estimatedRemainingMs(job({ total: 100, elapsedMs: 60_000 }))).toBeNull();
    });

    it('toplam bilinmiyorsa tahmin üretilmez', () => {
        expect(estimatedRemainingMs(job({ total: 0, okCount: 10, elapsedMs: 60_000 }))).toBeNull();
    });

    it('geçen süre ve hız oranından hesaplanır', () => {
        // 10 db / 60 sn => 6 sn/db; 90 db kaldı => 540 sn.
        const value = estimatedRemainingMs(job({ total: 100, okCount: 10, elapsedMs: 60_000 }));

        expect(value).toBe(540_000);
    });

    it('hata alan veritabanı da işlenmiş sayılır', () => {
        const value = estimatedRemainingMs(job({ total: 100, okCount: 8, failCount: 2, elapsedMs: 60_000 }));

        expect(value).toBe(540_000);
    });
});

describe('biçimleme', () => {
    it('süre ss:dd:ss', () => {
        expect(formatDuration(0)).toBe('00:00:00');
        expect(formatDuration(36 * 60_000 + 31_000)).toBe('00:36:31');
        expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe('02:05:00');
    });

    it('geçersiz süre tire gösterir', () => {
        expect(formatDuration(Number.NaN)).toBe('—');
        expect(formatDuration(-5)).toBe('—');
    });

    it('tahmin metni', () => {
        expect(formatEta(null)).toBe('hesaplanıyor…');
        expect(formatEta(20_000)).toBe('<1 dk');
        expect(formatEta(12 * 60_000)).toBe('~12 dk');
        expect(formatEta(80 * 60_000)).toBe('~1 sa 20 dk');
        expect(formatEta(120 * 60_000)).toBe('~2 sa');
    });
});

describe('bitmiş durumlar', () => {
    it('panelden düşecek durumlar', () => {
        expect(isFinishedState('Succeeded')).toBe(true);
        expect(isFinishedState('Failed')).toBe(true);
        expect(isFinishedState('Deleted')).toBe(true);
        expect(isFinishedState('Processing')).toBe(false);
        expect(isFinishedState('Enqueued')).toBe(false);
    });
});
