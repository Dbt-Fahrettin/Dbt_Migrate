import { describe, expect, it } from 'vitest';

import {
    PRG_KIND,
    buildPayload,
    defaultExeName,
    newForm,
    nextItemId,
    normalizePackNos,
    packTypesFor,
    validateForm,
    versionIntFrom,
    versionStringFor,
} from './versionPublishModel';

describe('sürüm numarası', () => {
    it('bugünden metin ve sayı üretir', () => {
        expect(versionStringFor(new Date(2026, 10, 23))).toBe('2611.23.1');
        expect(versionIntFrom('2611.23.1')).toBe(26112301);
        expect(versionIntFrom('2611.05.12')).toBe(26110512);
    });

    it('biçim tutmazsa null döner', () => {
        expect(versionIntFrom('26.11.23')).toBeNull();
        expect(versionIntFrom('')).toBeNull();
    });

    it('yeni form bugünün sürümüyle başlar', () => {
        const form = newForm(new Date(2026, 10, 23));

        expect(form.vns).toBe('2611.23.1');
        expect(form.vni).toBe('26112301');
        expect(form.setupExe).toBe('Unideva_Setup_T.exe');
    });
});

describe('hedef paket tipleri', () => {
    it('WPF ekranıyla aynı listeleri verir', () => {
        expect(packTypesFor('all')).toBe('');
        expect(packTypesFor('prime')).toBe('100;50;90');
        expect(packTypesFor('commerce')).toBe('10;20;30;40;50;60;70;80;90');
        expect(packTypesFor('manufacturing')).toBe('60;70;80;90');
    });

    it('Prod için Unideva_Setup.exe', () => {
        expect(defaultExeName(PRG_KIND.prod)).toBe('Unideva_Setup.exe');
    });
});

describe('paket numaraları', () => {
    it('ayraçları ; yapar, tekrarı atar', () => {
        expect(normalizePackNos('500025, 500070;500025 500035')).toEqual({ value: '500025;500070;500035', invalid: [] });
    });

    it('geçersiz parçayı bildirir', () => {
        expect(normalizePackNos('500025 abc 12').invalid).toEqual(['abc', '12']);
    });
});

describe('doğrulama ve gövde', () => {
    it('varsayılan form geçerlidir', () => {
        expect(validateForm(newForm(new Date(2026, 10, 23)))).toEqual([]);
    });

    it('bozuk alanları yakalar', () => {
        const form = { ...newForm(), vns: 'x', vni: '12', setupUrl: '', packNos: 'zz', items: [{ id: 1, modul: '', description: 'a' }] };

        expect(validateForm(form)).toHaveLength(5);
    });

    it('kayıt gövdesini WPF biçiminde kurar', () => {
        const form = {
            ...newForm(new Date(2026, 10, 23)),
            mandatory: true,
            target: 'prime' as const,
            items: [
                { id: 2, modul: 'Cari', description: 'b' },
                { id: 1, modul: 'Stok', description: 'a' },
            ],
        };

        const p = buildPayload(form, { id: 'u1', name: 'Ad Soyad' }, 'g1', new Date('2026-11-23T10:00:00Z'));

        expect(p).toMatchObject({ id: 'g1', prgVers: 0, prgKind: 0, vni: 26112301, ism: true, packTypes: '100;50;90', updateCount: 1 });
        expect(JSON.parse(p.xnf)).toEqual([
            { Id: 1, Modul: 'Stok', Description: 'a' },
            { Id: 2, Modul: 'Cari', Description: 'b' },
        ]);
        expect(p.creatorName).toBe('Ad Soyad');
    });

    it('sonraki satır numarası', () => {
        expect(nextItemId([])).toBe(1);
        expect(nextItemId([{ id: 3, modul: 'a', description: 'b' }])).toBe(4);
    });
});
