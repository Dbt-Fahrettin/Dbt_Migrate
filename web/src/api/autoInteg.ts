/**
 * Otomatik hazırlık (gece GİB faturalarından hazır fiş / Defter Beyan kaydı) yönetimi — Service.Api `AutoIntegAdmin`.
 *
 * Uçlar `MasterController` ile aynı servis anahtarını (`X-Svc-Key`, `ServiceKeys:Admin`) ister; anahtar eksik ya da yanlışsa
 * 404 döner (bkz. serviceKey.ts). Anahtarlar seçili ortamın servisinde tutulur: Test'te yapılan değişiklik Prod'a geçmez.
 * İşlemi yapan kullanıcı gövdede `actor` olarak gider ve sunucuda kayda geçer.
 */

import { endpoints } from './endpoints';
import { getJson, postJson } from './http';
import type { ApiResult } from './http';
import { serviceKeyHeaders } from './serviceKey';

export interface AutoIntegPack {
    packNo: number;
    allowed: boolean;
    /** "on" / "off" = pakete özel işaret; boş = genel kural. */
    explicit: string | null;
    enabledCompanies: number | null;
    scannedAt: string | null;
    lastRunAt: string | null;
    lastResult: string | null;
    lastPrepared: number | null;
}

export interface AutoIntegLogRow {
    at: string;
    actor: string;
    action: string;
    detail: string | null;
}

export interface AutoIntegStatus {
    environment: string | null;
    staticPackNo: number;
    /** Anahtarlar ve yapılandırma birlikte değerlendirilince iş bu ortamda çalışır mı. */
    active: boolean;
    /** Ana şalter: null = yapılandırma dosyası geçerli. */
    master: boolean | null;
    /** Tüm paketler: null = yapılandırma listesi, true = tüm canlı paketler, false = yalnız açık liste. */
    allPacks: boolean | null;
    onPacks: number[];
    offPacks: number[];
    settingsEnabled: boolean;
    settingsPackNos: number[];
    sweepMinutes: number;
    lastTurnAt: string | null;
    lastFullScanAt: string | null;
    pendingCompanies: number;
    packs: AutoIntegPack[];
    log: AutoIntegLogRow[];
}

/** Sunucuya giden işlemler (uç adı). */
export type AutoIntegAction = 'master' | 'packs/on' | 'packs/off' | 'packs/clear' | 'all-on' | 'all-off' | 'reset';

export function getAutoIntegStatus(apiBaseUrl: string, signal?: AbortSignal): Promise<ApiResult<AutoIntegStatus>> {
    return getJson<AutoIntegStatus>(endpoints.autoInteg(apiBaseUrl, 'status'), signal, serviceKeyHeaders(apiBaseUrl));
}

export function postAutoInteg(
    apiBaseUrl: string,
    action: AutoIntegAction,
    body: { actor: string; enabled?: boolean | null; packNos?: string[] },
    signal?: AbortSignal,
): Promise<ApiResult<AutoIntegStatus>> {
    return postJson<AutoIntegStatus>(endpoints.autoInteg(apiBaseUrl, action), body, signal, serviceKeyHeaders(apiBaseUrl));
}

/**
 * Hatayı okunur hâle getirir (hiçbiri yutulmaz). 404 iki şey olabilir: servis anahtarı eksik/yanlış
 * (ServiceKeyRequired bilerek 404 döner) ya da ucun olmadığı eski sunucu sürümü.
 */
export function describeAutoIntegFailure(result: ApiResult<unknown>): string {
    if (result.status === 404) {
        return (
            'Sunucu 404 döndü. İki sebebi olabilir: servis anahtarı eksik ya da yanlış ' +
            '(Migration İşlemleri ekranındaki "Servis anahtarı" alanı), ya da bu ortamdaki sürüm ' +
            'henüz bu ucu içermiyor — Service.Api yayını bekleniyor.'
        );
    }

    if (result.status === 0) {
        return result.error || 'Servise ulaşılamadı.';
    }

    if (result.status === 400) {
        const message = (result.data as { message?: unknown } | null)?.message;

        if (typeof message === 'string' && message) {
            return message;
        }
    }

    return result.error || `Status Code: ${result.status}`;
}
