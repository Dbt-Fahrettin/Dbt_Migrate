import { gibEndpoints } from './endpoints';
import { getJson, postJson } from './http';
import type { ApiResult } from './http';

/**
 * Gib.Api — gece sorgulama servisinin çalışma zamanı anahtarları.
 *
 * Durum 18.09.2026'dan beri veritabanında (`GibInv.NightlyQueryControls`, tek satır) ve küme
 * genelinde geçerli; önceki sürümde bellekte tutuluyordu. Tablo ilk kurulduğunda satır
 * **kapalı** varsayılanla yazılır (`IsEnabled = AutoStartEnabled = false`).
 */

/** GetNightlyQueryState / SetNightlyQueryState yanıtı. */
export interface NightlyQueryState {
    /** Gece sorgusu şu an açık mı (çalışma zamanı anahtarı). */
    isEnabled: boolean;

    /**
     * Pencere açıldığında gece sorgusu kendiliğinden açılsın mı.
     * Kapalıyken her yeniden başlatmadan sonra elle açmak gerekir.
     */
    autoStartEnabled: boolean;

    /** Şu an 18:00–07:00 penceresinin içinde miyiz. */
    isWithinExecutionWindow: boolean;

    /** Sorgulanmakta olan gün. */
    activeQueryDate: string;

    /** İşlenen son kayıt sayacı. */
    lastCounter: number;

    /** Durumun en son değiştirildiği an. */
    updatedAtUtc: string;

    /**
     * Şu an ne koşuyor: `Night`, `Daytime` ya da `Idle`.
     * Opsiyonel: alanı olmayan eski bir dağıtıma karşı da ekran bozulmasın.
     */
    mode?: string;
}

/** SetNightlyQueryState gövdesi; gönderilen alanlar güncellenir, gönderilmeyene dokunulmaz. */
export interface NightlyStatePatch {
    isEnabled?: boolean;
    autoStartEnabled?: boolean;
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
 * Anahtarları günceller. Gönderilen alanlar yazılır, gönderilmeyen alanlara dokunulmaz;
 * hiçbiri gönderilmezse sunucu 400 döner.
 *
 * **Sunucuda iki sessiz bağlantı kuralı var** (GibDbRepo, "Bellek icindeki eski davranisin aynisi"):
 *
 * 1. `autoStartEnabled: true` **tek başına** gelirse `IsEnabled` de açılır.
 * 2. `isEnabled: false` **tek başına** gelirse `AutoStartEnabled` de kapanır.
 *
 * Bu yüzden AutoStart düğmeleri iki alanı da açıkça gönderir (bkz. GibNightlyPage): aksi hâlde
 * "AutoStart Aç" sessizce gece servisini de başlatırdı. Gece servisini kapatmanın AutoStart'ı da
 * kapatması ise sunucunun kasıtlı davranışıdır, korunuyor — ekranda yazıyor.
 */
export function setNightlyState(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    patch: NightlyStatePatch,
    signal?: AbortSignal,
): Promise<ApiResult<NightlyQueryState>> {
    return postJson<NightlyQueryState>(
        gibEndpoints.setNightlyState(gibApiBaseUrl),
        patch,
        signal,
        authHeaders(token),
    );
}
