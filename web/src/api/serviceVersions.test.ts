import { describe, expect, it } from 'vitest';
import {
    SERVICE_DEFINITIONS,
    VERSION_ENVIRONMENTS,
    parseVersionBanner,
    serviceVersionUrl,
    versionCellKey,
} from './serviceVersions';

/**
 * Ham satırlar 16.10.2026'da canlı uçlardan alındı. Biçim değişirse bu testler düşer ve
 * ekranın sessizce yanlış sayı göstermesi yerine uyarı buradan gelir.
 */

describe('sürüm satırını ayrıştırma', () => {
    it("Service.Api'nin ikinci parantezini sürüm sanmaz", () => {
        const banner = parseVersionBanner('Unideva Service Api (2610.16.1) works! - (6879) - 639277327063458551');

        expect(banner).toEqual({ appName: 'Unideva Service Api', version: '2610.16.1' });
    });

    it('Gib.Api satırını okur', () => {
        expect(parseVersionBanner('Unideva.Gib.Api (2610.13.2) works! - 639277327077291867')).toEqual({
            appName: 'Unideva.Gib.Api',
            version: '2610.13.2',
        });
    });

    it('Login.Api satırını okur', () => {
        expect(parseVersionBanner('Devatek.Login (2610.16.1) works! - 639277327085475224')).toEqual({
            appName: 'Devatek.Login',
            version: '2610.16.1',
        });
    });

    it('baştaki ve sondaki boşluğu yutar', () => {
        expect(parseVersionBanner('  Devatek.Login (1.2.3) works!  \n')?.version).toBe('1.2.3');
    });

    it('biçim tutmazsa null döner — ham satır gösterilsin', () => {
        expect(parseVersionBanner('')).toBeNull();
        expect(parseVersionBanner('<html><body>502 Bad Gateway</body></html>')).toBeNull();
        expect(parseVersionBanner('Devatek.Login çalışıyor')).toBeNull();
    });
});

describe('sürüm hedefleri', () => {
    it('yalnız Test ve Prod sorulur — Local dışarıda', () => {
        expect(VERSION_ENVIRONMENTS.map((d) => d.key)).toEqual(['test', 'prod']);
    });

    it('her servis için doğru adres kurulur', () => {
        const test = VERSION_ENVIRONMENTS.find((d) => d.key === 'test');

        expect(test).toBeDefined();

        const urls = SERVICE_DEFINITIONS.map((service) => serviceVersionUrl(service, test!));

        expect(urls).toEqual([
            'https://test.unideva.com/svc/api/test',
            'https://test.unideva.com/gib/api/test',
            'https://login-test.unideva.com/api/test',
        ]);
    });

    it('hücre anahtarı servis ve ortamı birlikte taşır', () => {
        expect(versionCellKey('svc', 'prod')).toBe('svc:prod');
        expect(versionCellKey('svc', 'test')).not.toBe(versionCellKey('svc', 'prod'));
    });
});
