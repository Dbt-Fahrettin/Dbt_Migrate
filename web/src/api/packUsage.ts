/**
 * Paket kullanım sıralaması.
 *
 * Migration'ı hangi sırayla koşturacağımıza karar vermek için paketlerin ne kadar ve ne zaman
 * kullanıldığını gösterir. Kaynak sunucuda Login veritabanındaki giriş kayıtları
 * (`login.session_logs`, paket numarası + giriş zamanı): ayrıca bir istatistik toplamaya gerek yok,
 * geçmiş (17 ay) zaten tutuluyor.
 *
 * Puan = sabah girişleri × 3 + aktif günler. Sabah = 05:00-09:59 (Türkiye saati), pencere son 30 gün.
 * Gerçek veride ölçüldü (17.11.2026): girişler 08:00-10:00 arasında yoğunlaşıyor (09:00'da 14.720),
 * 05:00-07:00 arası neredeyse boş; bu yüzden "erken" gün başlarken ilk açılan paketleri yakalıyor.
 *
 * Bu uç yalnız ÖNİZLEME içindir: sıralamayı işi başlatmadan görmek. İşin kendisi sunucuda aynı
 * sıralamayı `order=usage` ile kendisi kurar; istemci sıra göndermez.
 */

import { endpoints } from './endpoints';
import { getJson } from './http';
import type { ApiResult } from './http';
import { serviceKeyHeaders } from './serviceKey';

export interface PackUsageRow {
    packNo: string;
    logins: number;
    activeDays: number;
    earlyLogins: number;
    lastLogin: string | null;
    score: number;
}

export interface PackUsageRanking {
    /** Veri okunabildi mi. Okunamazsa sunucu numara sırasına düşer, iş durmaz. */
    isAvailable: boolean;
    message: string | null;
    windowDays: number;
    earlyFromHour: number;
    /** Üst sınır DAHİL DEĞİL: 10 = 09:59'a kadar. */
    earlyToHour: number;
    earlyWeight: number;
    /** Pencerede en az bir girişi olan paket sayısı. */
    rankedCount: number;
    rows: PackUsageRow[];
}

export function getPackUsageRanking(
    apiBaseUrl: string,
    from: number,
    to: number,
    top: number,
    signal?: AbortSignal,
): Promise<ApiResult<PackUsageRanking>> {
    return getJson<PackUsageRanking>(
        endpoints.packUsageRanking(apiBaseUrl, from, to, top),
        signal,
        serviceKeyHeaders(apiBaseUrl),
    );
}

export interface PackRange {
    from: number;
    to: number;
}

/** Start/End yoksa bakılan aralık: canlı müşteri paketleri. */
export const DEFAULT_USAGE_RANGE: PackRange = { from: 500000, to: 509999 };

/**
 * Start/End kutularından sıralanacak paket aralığını çıkarır.
 *
 * Kutular iki biçimde kullanılıyor ve ikisi de burada karşılanır: End doluysa Start..End, boşsa Start
 * bir ÖNEK'tir ("50" → 500000-509999, "123" → 123000-123999). Çözülemezse varsayılan aralık döner:
 * önizleme bir kolaylıktır, yanlış girdiyle sessizce boş sonuç vermek yerine anlamlı bir şey göstersin.
 */
export function usageRangeOf(startText: string, endText: string): PackRange {
    const start = Number.parseInt(startText.trim(), 10);
    const end = Number.parseInt(endText.trim(), 10);

    if (!Number.isInteger(start) || start <= 0) {
        return DEFAULT_USAGE_RANGE;
    }

    if (Number.isInteger(end) && end >= start) {
        return { from: start, to: end };
    }

    const digits = String(start).length;

    // Paket numarası 6 hane: 7+ haneli bir değer önek olamaz.
    if (digits > 6) {
        return DEFAULT_USAGE_RANGE;
    }

    const span = 10 ** (6 - digits);

    return { from: start * span, to: start * span + span - 1 };
}

/** Önizleme tablosunda "son giriş" sütunu: gg.aa ss:dd (Türkiye saati). */
export function formatLastLogin(value: string | null): string {
    if (!value) {
        return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return new Intl.DateTimeFormat('tr-TR', {
        timeZone: 'Europe/Istanbul',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}
