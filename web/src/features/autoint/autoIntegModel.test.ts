import { describe, expect, it } from 'vitest';
import { describeAutoIntegFailure } from '../../api/autoInteg';
import type { ApiResult } from '../../api/http';
import { allPacksText, confirmText, filterPacks, masterText, packStateText, parsePackNos } from './autoIntegModel';

const packs = [
    { packNo: 500123, allowed: true, explicit: 'on', enabledCompanies: 3 },
    { packNo: 500124, allowed: false, explicit: 'off', enabledCompanies: 0 },
    { packNo: 500200, allowed: true, explicit: null, enabledCompanies: null },
    { packNo: 500300, allowed: false, explicit: null, enabledCompanies: 1 },
];

function failure(status: number, data: unknown = null, error = ''): ApiResult<unknown> {
    return { isSuccess: false, status, content: '', data, error };
}

describe('ana şalter ve tüm paketler metni', () => {
    it('açık, kapalı ve yapılandırmaya bağlı durumları ayırır', () => {
        expect(masterText({ master: true, settingsEnabled: false }).tone).toBe('on');
        expect(masterText({ master: false, settingsEnabled: true }).tone).toBe('off');

        const file = masterText({ master: null, settingsEnabled: true });

        expect(file.tone).toBe('file');
        expect(file.label).toMatch(/Açık/);
        expect(masterText({ settingsEnabled: false }).label).toMatch(/Kapalı/);
    });

    it('tüm paketler bayrağını yazar', () => {
        expect(allPacksText(true)).toMatch(/Tüm canlı/);
        expect(allPacksText(false)).toMatch(/Yalnız açık/);
        expect(allPacksText(null)).toMatch(/yapılandırma/i);
    });

    it('pakete özel işaret genel kuraldan önce yazılır', () => {
        expect(packStateText({ allowed: true, explicit: 'on' })).toBe('Açık (pakete özel)');
        expect(packStateText({ allowed: false, explicit: 'off' })).toBe('Kapalı (pakete özel)');
        expect(packStateText({ allowed: true, explicit: null })).toBe('Açık (genel kural)');
        expect(packStateText({ allowed: false })).toBe('Kapalı (genel kural)');
    });
});

describe('paket listesi arama ve süzgeç', () => {
    it('paket no parçasıyla arar', () => {
        expect(filterPacks(packs, '5001', 'all').map((p) => p.packNo)).toEqual([500123, 500124]);
        expect(filterPacks(packs, '  ', 'all')).toHaveLength(4);
        expect(filterPacks(packs, '999', 'all')).toHaveLength(0);
    });

    it('ad varsa Türkçe büyük/küçük harf duyarsız arar', () => {
        const named = [{ packNo: 1, allowed: true, name: 'Işık Gıda' }];

        expect(filterPacks(named, 'ışık', 'all')).toHaveLength(1);
        expect(filterPacks(named, 'IŞIK', 'all')).toHaveLength(1);
    });

    it('süzgeçler', () => {
        expect(filterPacks(packs, '', 'open').map((p) => p.packNo)).toEqual([500123, 500200]);
        expect(filterPacks(packs, '', 'closed').map((p) => p.packNo)).toEqual([500124, 500300]);
        expect(filterPacks(packs, '', 'explicit').map((p) => p.packNo)).toEqual([500123, 500124]);
        expect(filterPacks(packs, '', 'withCompanies').map((p) => p.packNo)).toEqual([500123, 500300]);
    });
});

describe('paket metni ayrıştırma', () => {
    it('karışık ayraçları kabul eder, tekrarı atar', () => {
        expect(parsePackNos('500123, 500124;500123\n500200\t7')).toEqual({
            packs: ['500123', '500124', '500200', '7'],
            invalid: [],
        });
    });

    it('geçersiz parçayı atlamaz, bildirir', () => {
        for (const text of ['abc', '500123, x', '-5', '0', '12345678', '99999999999999999999']) {
            expect(parsePackNos(text).invalid.length).toBeGreaterThan(0);
        }
    });

    it('boş metin geçersiz değil, boştur', () => {
        expect(parsePackNos('')).toEqual({ packs: [], invalid: [] });
        expect(parsePackNos('  , ;')).toEqual({ packs: [], invalid: [] });
    });
});

describe('onay metinleri', () => {
    it('ortamı başlıkta yazar', () => {
        for (const a of ['master-on', 'master-off', 'master-file', 'all-on', 'all-off', 'reset'] as const) {
            const c = confirmText(a, 'Prod');

            expect(c.title).toContain('Prod');
            expect(c.body.length).toBeGreaterThan(20);
            expect(c.button.length).toBeGreaterThan(0);
        }

        expect(confirmText('all-on', 'Test').title).toMatch(/tüm paketlere açılsın mı/);
    });
});

describe('hata yorumlama', () => {
    it('404 anahtar ya da sürüm eksikliğini söyler', () => {
        expect(describeAutoIntegFailure(failure(404))).toMatch(/servis anahtarı/);
    });

    it('400 sunucunun mesajını gösterir', () => {
        expect(describeAutoIntegFailure(failure(400, { message: 'Paket numarası geçersiz.' }))).toBe('Paket numarası geçersiz.');
    });

    it('ulaşılamayan servis ve diğer hatalar yutulmaz', () => {
        expect(describeAutoIntegFailure(failure(0, null, 'Failed to fetch'))).toBe('Failed to fetch');
        expect(describeAutoIntegFailure(failure(500, null, 'Status Code: 500 -- x'))).toContain('500');
        expect(describeAutoIntegFailure(failure(503))).toContain('503');
    });
});
