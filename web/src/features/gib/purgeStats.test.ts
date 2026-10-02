import { describe, expect, it } from 'vitest';
import {
    computePurgeRate,
    disabledSwitches,
    formatBytes,
    isPurgeStalled,
    parseBlockedIds,
    toSample,
} from './purgeStats';
import type { XmlPurgeControl, XmlPurgeJobState } from '../../api/gibPurge';

const NOW = Date.parse('2026-10-02T12:00:00Z');

function control(partial: Partial<XmlPurgeControl> = {}): XmlPurgeControl {
    return {
        isEnabled: true,
        batchSize: 50,
        pauseMs: 1000,
        maxWalBacklogMb: 2048,
        cursorBeforeCounter: 2_611_000,
        leaseOwner: 'und-gib-deployment-abc',
        leaseExpiresAtUtc: '2026-10-02T12:05:00Z',
        startedAtUtc: '2026-10-02T10:00:00Z',
        lastBatchAtUtc: '2026-10-02T11:59:30Z',
        batchCount: 120,
        clearedCount: 5980,
        freedBytes: 650_000_000,
        statusMessage: null,
        blockedIds: null,
        stateUpdatedAtUtc: '2026-10-02T11:59:30Z',
        ...partial,
    };
}

function jobState(partial: Partial<XmlPurgeJobState> = {}): XmlPurgeJobState {
    return {
        purgeEnabled: true,
        readEnabled: true,
        storeOnly: true,
        walBacklogMb: 12,
        walBacklogError: null,
        control: control(),
        ...partial,
    };
}

describe('computePurgeRate', () => {
    it('iki örnekten satır/sn ve GB/saat üretir', () => {
        const previous = { clearedCount: 1000, freedBytes: 1_000_000_000, at: NOW };
        const current = { clearedCount: 1600, freedBytes: 1_720_000_000, at: NOW + 60_000 };

        const rate = computePurgeRate(previous, current);

        expect(rate?.rowsPerSecond).toBeCloseTo(10, 5); // 600 satır / 60 sn
        expect(rate?.gbPerHour).toBeCloseTo(43.2, 5); // 0,72 GB / dk × 60
    });

    it('ilk örnekte hız yok', () => {
        expect(computePurgeRate(null, { clearedCount: 10, freedBytes: 10, at: NOW })).toBeNull();
    });

    it('süre ilerlemediyse hız üretmez', () => {
        const sample = { clearedCount: 10, freedBytes: 10, at: NOW };

        expect(computePurgeRate(sample, { ...sample, clearedCount: 20 })).toBeNull();
    });

    /** restart ile imleç sıfırlanınca ya da başka pod devralınca sayaç geriye gidebilir. */
    it('sayaç geriye gittiyse hız uydurmaz', () => {
        const previous = { clearedCount: 5000, freedBytes: 5_000_000_000, at: NOW };
        const current = { clearedCount: 10, freedBytes: 10_000_000, at: NOW + 15_000 };

        expect(computePurgeRate(previous, current)).toBeNull();
    });

    it('hiç ilerleme yoksa hız göstermez', () => {
        const previous = { clearedCount: 500, freedBytes: 500, at: NOW };

        expect(computePurgeRate(previous, { ...previous, at: NOW + 15_000 })).toBeNull();
    });

    it('toSample durum nesnesinden örnek çıkarır', () => {
        expect(toSample(jobState(), NOW)).toEqual({
            clearedCount: 5980,
            freedBytes: 650_000_000,
            at: NOW,
        });
    });
});

describe('formatBytes', () => {
    it('büyük değerleri GB, küçükleri MB olarak yazar', () => {
        expect(formatBytes(218_000_000_000)).toBe('218 GB');
        expect(formatBytes(650_000_000)).toBe('0.65 GB');
        expect(formatBytes(5_000_000)).toBe('5 MB');
        expect(formatBytes(0)).toBe('0 GB');
    });
});

describe('isPurgeStalled', () => {
    it('kapalı işte uyarı vermez', () => {
        expect(isPurgeStalled(control({ isEnabled: false, lastBatchAtUtc: null }), NOW)).toBe(false);
    });

    it('son parti yakınsa uyarı vermez', () => {
        expect(isPurgeStalled(control({ lastBatchAtUtc: '2026-10-02T11:59:00Z' }), NOW)).toBe(false);
    });

    /** WAL beklemesi, düşen pod ya da sessiz durma: "AÇIK" rozeti tek başına bunu göstermiyor. */
    it('son parti eskiyse uyarı verir', () => {
        expect(isPurgeStalled(control({ lastBatchAtUtc: '2026-10-02T11:50:00Z' }), NOW)).toBe(true);
    });

    it('hiç parti yoksa başlangıçtan beri geçen süreye bakar', () => {
        expect(isPurgeStalled(control({ lastBatchAtUtc: null, startedAtUtc: '2026-10-02T11:59:30Z' }), NOW)).toBe(
            false,
        );

        expect(isPurgeStalled(control({ lastBatchAtUtc: null, startedAtUtc: '2026-10-02T10:00:00Z' }), NOW)).toBe(
            true,
        );
    });

    it('okunamayan tarihte uyarı vermez', () => {
        expect(isPurgeStalled(control({ lastBatchAtUtc: 'tarih-degil' }), NOW)).toBe(false);
    });
});

describe('parseBlockedIds', () => {
    it('virgüllü listeyi ayırır ve boşları eler', () => {
        expect(parseBlockedIds('a-1, b-2 ,, c-3')).toEqual(['a-1', 'b-2', 'c-3']);
    });

    it('boş değerlerde boş dizi döner', () => {
        expect(parseBlockedIds(null)).toEqual([]);
        expect(parseBlockedIds('')).toEqual([]);
    });
});

describe('disabledSwitches', () => {
    it('hepsi açıkken boş döner', () => {
        expect(disabledSwitches(jobState())).toEqual([]);
    });

    it('kapalı olanları adlandırır', () => {
        expect(disabledSwitches(jobState({ purgeEnabled: false, storeOnly: false }))).toEqual([
            'PurgeEnabled',
            'StoreOnly',
        ]);
    });
});
