import { gibEndpoints } from './endpoints';
import { getJson, postJson } from './http';
import type { ApiResult } from './http';

/**
 * Gib.Api — gece sorgulama servisinin çalışma zamanı anahtarı.
 *
 * Servisin durumu **bilinçli olarak bellekte** tutuluyor: her yayın/yeniden başlatma sonrası
 * KAPALI başlar ve elle açılması gerekir. Veritabanına taşınmadı, bu bir tasarım kararı —
 * ekranda da böyle yazıyor ki "neden yine kapanmış?" sorusu doğmasın.
 */

/** GetNightlyQueryState / SetNightlyQueryState yanıtı. */
export interface NightlyQueryState {
    /** Gece sorgusu şu an açık mı (çalışma zamanı anahtarı). */
    isEnabled: boolean;

    /** Servis açılışta kendiliğinden başlasın mı. */
    autoStartEnabled: boolean;

    /** Şu an 18:00–07:00 penceresinin içinde miyiz. */
    isWithinExecutionWindow: boolean;

    /** Sorgulanmakta olan gün. */
    activeQueryDate: string;

    /** İşlenen son kayıt sayacı. */
    lastCounter: number;

    /** Durumun en son değiştirildiği an. */
    updatedAtUtc: string;
}

function authHeaders(token: string | null | undefined): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * 401'i ayrı yorumlar: bu uçlar `[Authorize]` altında ve Login.Api belirteci 2 gün geçerli.
 * Konsol oturumu daha uzun olabildiği için "giriş yapmış ama belirteci ölmüş" hâli mümkün.
 */
export function describeGibFailure(result: ApiResult<unknown>): string {
    if (result.status === 401) {
        return 'Yetki reddedildi (401). Giriş belirtecinin süresi dolmuş olabilir — çıkış yapıp tekrar girin.';
    }

    if (result.status === 403) {
        return 'Bu hesabın yetkisi yetmiyor (403).';
    }

    return result.error || `Status Code: ${result.status}`;
}

export function getNightlyState(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    signal?: AbortSignal,
): Promise<ApiResult<NightlyQueryState>> {
    return getJson<NightlyQueryState>(gibEndpoints.nightlyState(gibApiBaseUrl), signal, authHeaders(token));
}

/**
 * Gece sorgusunu açar/kapatır.
 *
 * Sunucu `IsEnabled` ve `AutoStartEnabled` alanlarını ayrı ayrı, gönderilirse günceller;
 * ikisi de boşsa 400 döner. Buradan yalnız `isEnabled` gönderiliyor — açılışta kendiliğinden
 * başlama ayarına dokunmak ayrı bir karar ve ekranda ona ait bir düğme yok.
 */
export function setNightlyState(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    isEnabled: boolean,
    signal?: AbortSignal,
): Promise<ApiResult<NightlyQueryState>> {
    return postJson<NightlyQueryState>(
        gibEndpoints.setNightlyState(gibApiBaseUrl),
        { isEnabled },
        signal,
        authHeaders(token),
    );
}
