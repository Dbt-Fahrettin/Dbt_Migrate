import type { NightlyQueryState, NightlyStatePatch } from '../../api/gibClient';

/** Ekrandaki dört işlem. */
export type ActionKind = 'enable' | 'disable' | 'autostart-on' | 'autostart-off';

export interface ActionSpec {
    label: string;
    /** Onay kutusunda yazılması gereken metin (yalnız Prod'da sorulur). */
    confirmWord: string;
    /** İşlem sonrası gösterilen bilgi satırı. */
    notice: string;
    /** Onay kutusundaki sonuç açıklaması. */
    effect: string;
}

export const ACTIONS: Record<ActionKind, ActionSpec> = {
    enable: {
        label: 'Gece Servisini Aç',
        confirmWord: 'AC',
        notice: 'Gece servisi açıldı.',
        effect: 'Pencere içindeyse sorgu hemen başlar.',
    },
    disable: {
        label: 'Gece Servisini Kapat',
        confirmWord: 'KAPAT',
        notice: 'Gece servisi kapatıldı. Sunucu AutoStart’ı da kapattı.',
        effect: 'Kapalıyken gece sorgusu koşmaz; o günün faturaları çekilmez. AutoStart da kapanır.',
    },
    'autostart-on': {
        label: 'AutoStart Aç',
        confirmWord: 'AC',
        notice: 'AutoStart açıldı.',
        effect: 'Servis yeniden başladığında gece sorgusu kendiliğinden açılır.',
    },
    'autostart-off': {
        label: 'AutoStart Kapat',
        confirmWord: 'KAPAT',
        notice: 'AutoStart kapatıldı.',
        effect: 'Her yeniden başlatmadan sonra gece servisini elle açmak gerekir.',
    },
};

/**
 * İşlemi sunucuya gidecek gövdeye çevirir.
 *
 * AutoStart düğmeleri `isEnabled`'ı da **açıkça** gönderir. Sebebi sunucudaki sessiz kural
 * (GibDbRepo): `autoStartEnabled: true` tek başına gelirse `IsEnabled` de açılıyor — yani
 * "AutoStart Aç" düğmesi istemeden gece servisini de başlatırdı. İki alanı birlikte göndermek
 * düğmenin yazdığı şeyi yapmasını sağlıyor.
 *
 * Gece servisini kapatmanın AutoStart'ı da kapatması (ikinci sessiz kural) sunucunun kasıtlı
 * davranışı; ona dokunulmuyor, ekranda yazılıyor.
 *
 * Durum okunamadıysa `isEnabled` için `false` varsayılır: bilinmeyen bir değeri "açık" sanıp
 * servisi istemeden başlatmaktansa kapalı kabul etmek daha güvenli.
 */
export function buildPatch(action: ActionKind, current: NightlyQueryState | null): NightlyStatePatch {
    switch (action) {
        case 'enable':
            return { isEnabled: true };

        case 'disable':
            return { isEnabled: false };

        case 'autostart-on':
            return { isEnabled: current?.isEnabled ?? false, autoStartEnabled: true };

        case 'autostart-off':
            return { isEnabled: current?.isEnabled ?? false, autoStartEnabled: false };
    }
}
