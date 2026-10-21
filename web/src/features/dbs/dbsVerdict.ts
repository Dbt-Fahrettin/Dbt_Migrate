import type { DbsAutoSendStatus } from '../../api/dbsAutoSend';

/**
 * Üç durumu ayırır. Ayrı dosyada çünkü asıl anlam burada: "yapılandırmada açık" ile
 * "gerçekten çalışıyor" aynı şey değil ve ikisini karıştırmak canlıda bir şikâyete yol açtı.
 */
export type VerdictKind = 'active' | 'disabled' | 'blocked';

export interface Verdict {
    kind: VerdictKind;
    title: string;
    detail: string;
}

export function describeVerdict(status: DbsAutoSendStatus): Verdict {
    if (status.isActive) {
        return {
            kind: 'active',
            title: 'Açık — gönderim çalışıyor',
            detail:
                'Firma ayarı da açık olan firmalarda, başlangıç tarihinden sonra kaydedilen kayıtlar ' +
                'bekleme süresi dolunca gönderilir.',
        };
    }

    if (!status.isEnabled) {
        return {
            kind: 'disabled',
            title: 'Kapalı — hiçbir şey gönderilmiyor',
            detail:
                'Sunucu anahtarı kapalı. Kullanıcı firma ayarını "Evet" görse bile kayıtlar DBS\'e gitmez; ' +
                'ayar açıkken girilenler anahtar açıldığında gönderilir.',
        };
    }

    return {
        kind: 'blocked',
        title: 'Yapılandırmada açık ama bu süreçte çalışmıyor',
        detail:
            'Geliştirme modunda ayrıca yerel deneme bayrağı gerekiyor; o kapalı olduğu için işler kurulmadı.',
    };
}

/** Karar rengi — ekranda ve rozette aynı anlamı taşısın diye tek yerde. */
export const VERDICT_TONE: Record<VerdictKind, string> = {
    active: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    disabled: 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200',
    blocked: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};
