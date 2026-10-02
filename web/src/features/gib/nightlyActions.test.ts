import { describe, expect, it } from 'vitest';
import { ACTIONS, buildPatch } from './nightlyActions';
import type { NightlyQueryState } from '../../api/gibClient';

function state(partial: Partial<NightlyQueryState> = {}): NightlyQueryState {
    return {
        isEnabled: false,
        autoStartEnabled: false,
        isWithinExecutionWindow: false,
        activeQueryDate: '0001-01-01T00:00:00',
        lastCounter: 0,
        updatedAtUtc: '2026-10-01T09:00:00Z',
        ...partial,
    };
}

/**
 * Sunucudaki iki sessiz kural (GibDbRepo):
 *   1. autoStartEnabled:true TEK BAŞINA gelirse IsEnabled de açılır.
 *   2. isEnabled:false TEK BAŞINA gelirse AutoStartEnabled de kapanır.
 *
 * Birinci kural "AutoStart Aç" düğmesinin istemeden gece servisini başlatmasına yol açardı;
 * bu yüzden AutoStart işlemleri isEnabled'ı da açıkça gönderiyor. Testler bunu koruyor.
 */
describe('buildPatch', () => {
    it('gece servisi düğmeleri yalnız isEnabled gönderir', () => {
        expect(buildPatch('enable', state())).toEqual({ isEnabled: true });
        expect(buildPatch('disable', state({ isEnabled: true }))).toEqual({ isEnabled: false });
    });

    it('AutoStart Aç, isEnabled’ı da açıkça gönderir - servisi istemeden başlatmasın', () => {
        const patch = buildPatch('autostart-on', state({ isEnabled: false }));

        expect(patch).toEqual({ isEnabled: false, autoStartEnabled: true });
        // Kritik: isEnabled alanı GÖNDERİLMELİ, yoksa sunucu servisi de açar.
        expect(Object.hasOwn(patch, 'isEnabled')).toBe(true);
    });

    it('AutoStart açıkken servis açıksa servisin durumunu korur', () => {
        expect(buildPatch('autostart-on', state({ isEnabled: true }))).toEqual({
            isEnabled: true,
            autoStartEnabled: true,
        });
    });

    it('AutoStart Kapat da servisin durumunu korur', () => {
        expect(buildPatch('autostart-off', state({ isEnabled: true, autoStartEnabled: true }))).toEqual({
            isEnabled: true,
            autoStartEnabled: false,
        });
    });

    it('durum okunamadıysa isEnabled için kapalı varsayar', () => {
        expect(buildPatch('autostart-on', null)).toEqual({ isEnabled: false, autoStartEnabled: true });
        expect(buildPatch('autostart-off', null)).toEqual({ isEnabled: false, autoStartEnabled: false });
    });
});

describe('ACTIONS', () => {
    it('her işlemin etiketi, onay kelimesi ve açıklaması var', () => {
        for (const spec of Object.values(ACTIONS)) {
            expect(spec.label).toBeTruthy();
            expect(spec.confirmWord).toBeTruthy();
            expect(spec.notice).toBeTruthy();
            expect(spec.effect).toBeTruthy();
        }
    });

    it('gece servisini kapatmanın AutoStart’ı da kapattığı kullanıcıya söyleniyor', () => {
        expect(ACTIONS.disable.effect).toContain('AutoStart');
        expect(ACTIONS.disable.notice).toContain('AutoStart');
    });
});
