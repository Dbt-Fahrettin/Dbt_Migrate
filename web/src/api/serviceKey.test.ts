import { afterEach, describe, expect, it } from 'vitest';
import {
    SERVICE_KEY_HEADER,
    isPlausibleServiceKey,
    loadServiceKey,
    saveServiceKey,
    serviceKeyHeaders,
} from './serviceKey';

/**
 * Testler node ortamında koşuyor, `window` yok. Bu modülün ilk işi zaten o durumda çökmemek —
 * aşağıdaki "window yokken" testi onu tutuyor. Geri kalanı için sahte bir depo takılıyor.
 */

const TEST_API = 'https://test.unideva.com/svc/api';
const PROD_API = 'https://hw.unideva.com/svc/api';

function attachStorage(): void {
    const map = new Map<string, string>();

    (globalThis as { window?: unknown }).window = {
        localStorage: {
            getItem: (key: string) => map.get(key) ?? null,
            setItem: (key: string, value: string) => void map.set(key, value),
            removeItem: (key: string) => void map.delete(key),
        },
    };
}

function detachStorage(): void {
    delete (globalThis as { window?: unknown }).window;
}

afterEach(() => {
    detachStorage();
});

describe('servis anahtarı', () => {
    it('window yokken sessizce boş döner (testler, SSR)', () => {
        expect(loadServiceKey(TEST_API)).toBe('');
        expect(serviceKeyHeaders(TEST_API)).toEqual({});
        expect(() => saveServiceKey(TEST_API, 'abc')).not.toThrow();
    });

    it('kaydedilen anahtar başlığa geçer', () => {
        attachStorage();
        saveServiceKey(TEST_API, 'k'.repeat(32));

        expect(serviceKeyHeaders(TEST_API)).toEqual({ [SERVICE_KEY_HEADER]: 'k'.repeat(32) });
    });

    it('ortamlar ayrı saklanır — Prod anahtarı Test isteğine gitmez', () => {
        attachStorage();
        saveServiceKey(PROD_API, 'prod-anahtari-uzun-degeri');

        expect(serviceKeyHeaders(TEST_API)).toEqual({});
        expect(loadServiceKey(PROD_API)).toBe('prod-anahtari-uzun-degeri');
    });

    it('boş değer kaydı siler, başlık da gitmez', () => {
        attachStorage();
        saveServiceKey(TEST_API, 'k'.repeat(32));
        saveServiceKey(TEST_API, '   ');

        expect(loadServiceKey(TEST_API)).toBe('');
        expect(serviceKeyHeaders(TEST_API)).toEqual({});
    });

    it('baştaki/sondaki boşluk kırpılır — kopyala-yapıştırda satır sonu kalıyor', () => {
        attachStorage();
        saveServiceKey(TEST_API, `  ${'k'.repeat(32)}\n`);

        expect(loadServiceKey(TEST_API)).toBe('k'.repeat(32));
    });

    it('16 karakterden kısa anahtar sunucuda tanımsız sayılır', () => {
        expect(isPlausibleServiceKey('k'.repeat(15))).toBe(false);
        expect(isPlausibleServiceKey('k'.repeat(16))).toBe(true);
        expect(isPlausibleServiceKey('')).toBe(false);
    });
});
