import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

describe('formatDateTime', () => {
    it('gün, ay, saat alanlarını iki haneye tamamlar', () => {
        expect(formatDateTime('2026-09-07T08:03:05')).toBe('07.09.2026 08:03:05');
    });

    it('okunamayan girdide boş döner', () => {
        expect(formatDateTime(null)).toBe('');
        expect(formatDateTime('')).toBe('');
        expect(formatDateTime('tarih-degil')).toBe('');
    });

    /**
     * Sunucu "değer yok"u DateTime.MinValue ile döndürüyor. Bunu tarih sanıp yazmak
     * ekranda "01.01.1 00" gibi anlamsız bir metin üretiyordu.
     */
    it('DateTime.MinValue’yu boş sayar', () => {
        expect(formatDateTime('0001-01-01T00:00:00')).toBe('');
    });
});

describe('formatDate', () => {
    it('yalnız günü verir', () => {
        expect(formatDate('2026-09-13T00:00:00')).toBe('13.09.2026');
        expect(formatDate('2026-01-02T23:59:59')).toBe('02.01.2026');
    });

    it('DateTime.MinValue ve bozuk girdide boş döner', () => {
        expect(formatDate('0001-01-01T00:00:00')).toBe('');
        expect(formatDate(null)).toBe('');
    });
});
