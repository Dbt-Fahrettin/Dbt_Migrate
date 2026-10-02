import { describe, expect, it } from 'vitest';
import { formatTokenRemaining, isTokenExpired, readTokenExpiry } from './token';

/** Gerçek bir JWT'nin yapısını taklit eder: header.payload.signature, payload base64url. */
function makeToken(payload: Record<string, unknown>): string {
    const encode = (value: object) =>
        btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.imza`;
}

const NOW = new Date('2026-09-17T12:00:00Z');

describe('readTokenExpiry', () => {
    it('exp alanını Unix saniyeden tarihe çevirir', () => {
        const expiry = new Date('2026-09-19T12:00:00Z');
        const token = makeToken({ exp: Math.floor(expiry.getTime() / 1000) });

        expect(readTokenExpiry(token)?.toISOString()).toBe(expiry.toISOString());
    });

    it('Türkçe karakter taşıyan payload’ı çözebilir', () => {
        const token = makeToken({ exp: 1789000000, name: 'Fahrettin Eroğlu · Şube' });

        expect(readTokenExpiry(token)).not.toBeNull();
    });

    it('bozuk ya da eksik girdide null döner', () => {
        expect(readTokenExpiry(null)).toBeNull();
        expect(readTokenExpiry('')).toBeNull();
        expect(readTokenExpiry('sadece-metin')).toBeNull();
        expect(readTokenExpiry('a.b')).toBeNull();
        expect(readTokenExpiry('a.!!!gecersiz!!!.c')).toBeNull();
        expect(readTokenExpiry(makeToken({ sub: 'exp yok' }))).toBeNull();
    });
});

describe('isTokenExpired', () => {
    it('süresi geçmiş belirteci dolmuş sayar', () => {
        const token = makeToken({ exp: Math.floor(NOW.getTime() / 1000) - 60 });

        expect(isTokenExpired(token, NOW)).toBe(true);
    });

    it('geçerli belirteci dolmamış sayar', () => {
        const token = makeToken({ exp: Math.floor(NOW.getTime() / 1000) + 3600 });

        expect(isTokenExpired(token, NOW)).toBe(false);
    });

    it('çözülemeyen belirteci dolmuş SAYMAZ - yanlış uyarı vermemek için', () => {
        expect(isTokenExpired('cozulemez', NOW)).toBe(false);
        expect(isTokenExpired(null, NOW)).toBe(false);
    });
});

describe('formatTokenRemaining', () => {
    const fromNow = (seconds: number) => makeToken({ exp: Math.floor(NOW.getTime() / 1000) + seconds });

    it('gün, saat ve dakikayı uygun birimde yazar', () => {
        // Login.Api belirteci 2 gün geçerli üretiyor; tipik hâl bu.
        expect(formatTokenRemaining(fromNow(2 * 24 * 3600 + 3 * 3600), NOW)).toBe('2 gün 3 saat');
        expect(formatTokenRemaining(fromNow(4 * 3600 + 12 * 60), NOW)).toBe('4 saat 12 dk');
        expect(formatTokenRemaining(fromNow(25 * 60), NOW)).toBe('25 dk');
    });

    it('süresi dolmuşu ve bilinmeyeni ayırır', () => {
        expect(formatTokenRemaining(fromNow(-60), NOW)).toBe('süresi dolmuş');
        expect(formatTokenRemaining('cozulemez', NOW)).toBe('bilinmiyor');
    });
});
