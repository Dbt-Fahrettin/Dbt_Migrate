import { describe, expect, it } from 'vitest';

import type { RefreshStatus } from '../../api/etrStatic';
import { isValidIdentifier, normalizeRefreshStatus, parseHealthVersion } from '../../api/etrStatic';
import { LOST_AFTER, formatElapsed, parseRecordCount, watchRefresh } from './refreshWatch';

const running: RefreshStatus = { running: true, startedUtc: 'x', finishedUtc: null, isOk: null, message: null };
const done: RefreshStatus = { running: false, startedUtc: 'x', finishedUtc: 'y', isOk: true, message: '5:abc' };
const unseen: RefreshStatus = { running: false, startedUtc: null, finishedUtc: null, isOk: null, message: null };

function sequence(items: Array<RefreshStatus | null>): () => Promise<RefreshStatus | null> {
    let i = 0;

    return async () => items[Math.min(i++, items.length - 1)];
}

const noWait = async () => undefined;

describe('watchRefresh', () => {
    it('iş bitince sonucu döner ve ara durumları bildirir', async () => {
        const seen: boolean[] = [];

        const outcome = await watchRefresh(sequence([running, running, done]), (s) => seen.push(s.running), noWait, () => false);

        expect(outcome).toEqual({ kind: 'finished', status: done });
        expect(seen).toEqual([true, true, false]);
    });

    it('okunamayan yanıtlar izlemeyi bitirmez', async () => {
        const outcome = await watchRefresh(sequence([null, running, null, done]), () => undefined, noWait, () => false);

        expect(outcome.kind).toBe('finished');
    });

    it('işi hiç görmeyen kopya üst üste LOST_AFTER kez görülünce izleme bırakılır', async () => {
        let reads = 0;

        const outcome = await watchRefresh(
            async () => {
                reads += 1;

                return unseen;
            },
            () => undefined,
            noWait,
            () => false,
        );

        expect(outcome).toEqual({ kind: 'lost' });
        expect(reads).toBe(LOST_AFTER);
    });

    it('arada çalışan yanıt görünmüyor sayacını sıfırlar', async () => {
        const outcome = await watchRefresh(
            sequence([unseen, unseen, running, unseen, unseen, done]),
            () => undefined,
            noWait,
            () => false,
        );

        expect(outcome.kind).toBe('finished');
    });

    it('durdurulunca aborted döner', async () => {
        const outcome = await watchRefresh(sequence([running]), () => undefined, noWait, () => true);

        expect(outcome).toEqual({ kind: 'aborted' });
    });
});

describe('yardımcılar', () => {
    it('kayıt sayısını iki ileti biçiminden okur', () => {
        expect(parseRecordCount('123456:7c9e-guid')).toBe(123456);
        expect(parseRecordCount('pk list count: 42')).toBe(42);
        expect(parseRecordCount('hata oluştu')).toBeNull();
        expect(parseRecordCount(null)).toBeNull();
    });

    it('geçen süreyi yazar', () => {
        expect(formatElapsed(0, 5_000)).toBe('5 sn');
        expect(formatElapsed(0, 125_000)).toBe('2 dk 05 sn');
        expect(formatElapsed(10_000, 0)).toBe('0 sn');
    });

    it('VKN 10, TCKN 11 hane', () => {
        expect(isValidIdentifier('1234567890')).toBe(true);
        expect(isValidIdentifier(' 12345678901 ')).toBe(true);
        expect(isValidIdentifier('123456789')).toBe(false);
        expect(isValidIdentifier('12345abc90')).toBe(false);
    });

    it('hiç çalışmamış işin eksik alanları null olur (bitti sanılmaz)', () => {
        const status = normalizeRefreshStatus({ running: false });

        expect(status).toEqual({ running: false, startedUtc: null, finishedUtc: null, isOk: null, message: null });
        expect(normalizeRefreshStatus(null)).toBeNull();
    });

    it('sağlık yanıtından sürümü okur', () => {
        expect(parseHealthVersion('Dbt Static Api works! (EtrController) - (1.4.2) - 638000')).toBe('1.4.2');
        expect(parseHealthVersion('başka bir yanıt')).toBeNull();
    });
});
