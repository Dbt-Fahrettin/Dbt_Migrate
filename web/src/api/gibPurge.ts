import { gibEndpoints } from './endpoints';
import { getJson, postJson } from './http';
import type { ApiResult } from './http';

/**
 * Gib.Api — `gib_inv.gib_invoices.xml_content` kolonunu boşaltan arka plan işi.
 *
 * Fatura XML'leri nesne deposuna taşındıktan sonra kolonda kalan ~260 GB TOAST veriyi
 * boşaltır: en yeni kayıttan eskiye, küçük partiler hâlinde, **her satır silinmeden önce
 * depodan indirilip kolonla birebir karşılaştırılarak**. Durum veritabanında
 * (`gib_inv.xml_purge_controls`), pod yeniden başlasa da kaldığı yerden sürer; iki pod'dan
 * yalnız kiralamayı alan koşar. WAL birikimi sınırı aşarsa kendiliğinden bekler.
 *
 * Bu uçlar yalnız **durumu okur ve anahtarı çevirir**; boşaltmayı sunucudaki servis yapar.
 * Hepsi `[Authorize]` altında (sınıf düzeyinde).
 */

/** `gib_inv.xml_purge_controls` tek satırı. */
export interface XmlPurgeControl {
    isEnabled: boolean;
    batchSize: number;
    pauseMs: number;
    maxWalBacklogMb: number;

    /** İşlenecek bir sonraki satırın üst sınırı; 0 = en yeniden başlayacak. */
    cursorBeforeCounter: number;

    /** Kiralamayı elinde tutan pod; boşsa kimse koşmuyor. */
    leaseOwner?: string | null;
    leaseExpiresAtUtc?: string | null;

    startedAtUtc?: string | null;
    lastBatchAtUtc?: string | null;

    batchCount: number;
    clearedCount: number;
    freedBytes: number;

    /** Bekleme/durma sebebi; normal akışta null. */
    statusMessage?: string | null;

    /** Yalnız kanıtlanamayan satır yüzünden durduysa dolu: virgülle ayrılmış id listesi. */
    blockedIds?: string | null;

    stateUpdatedAtUtc?: string | null;
}

/** Üç ucun da döndüğü yanıt. */
export interface XmlPurgeJobState {
    /** Yapılandırma izinleri; üçünden biri false ise iş açılamaz. */
    purgeEnabled: boolean;
    readEnabled: boolean;
    storeOnly: boolean;

    /** Sorgu düşerse null gelir, sebebi walBacklogError'da. */
    walBacklogMb?: number | null;
    walBacklogError?: string | null;

    control: XmlPurgeControl;
}

/** Hepsi opsiyonel; gönderilmeyen alan satırdaki değerini korur. */
export interface XmlPurgeStartRequest {
    batchSize?: number;
    pauseMs?: number;
    maxWalBacklogMb?: number;

    /** true ise imleç sıfırlanır ve iş en yeni satırdan yeniden başlar (ikinci tur). */
    restart?: boolean;
}

function authHeaders(token: string | null | undefined): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getPurgeJob(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    signal?: AbortSignal,
): Promise<ApiResult<XmlPurgeJobState>> {
    return getJson<XmlPurgeJobState>(gibEndpoints.purgeJob(gibApiBaseUrl), signal, authHeaders(token));
}

/**
 * İşi açar. **Gerçek ve geri alınamaz boşaltma başlatır.**
 *
 * Yapılandırmada `GibXmlStore:PurgeEnabled` ya da `ReadEnabled` kapalıysa sunucu 409 ve düz
 * metin gövde döner (describeGibFailure bu gövdeyi olduğu gibi gösterir).
 */
export function startPurgeJob(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    request: XmlPurgeStartRequest,
    signal?: AbortSignal,
): Promise<ApiResult<XmlPurgeJobState>> {
    return postJson<XmlPurgeJobState>(
        gibEndpoints.startPurgeJob(gibApiBaseUrl),
        request,
        signal,
        authHeaders(token),
    );
}

/** İşi kapatır; imleç korunur, yeniden açılınca oradan sürer. */
export function stopPurgeJob(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    signal?: AbortSignal,
): Promise<ApiResult<XmlPurgeJobState>> {
    return postJson<XmlPurgeJobState>(gibEndpoints.stopPurgeJob(gibApiBaseUrl), {}, signal, authHeaders(token));
}
