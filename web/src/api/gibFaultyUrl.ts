import { gibEndpoints } from './endpoints';
import { getJson, postJson } from './http';
import type { ApiResult } from './http';

/**
 * Gib.Api — XML'i alınamayan belge adreslerinin domain bazında teşhisi.
 *
 * Gece sorgusu faturanın XML'ini entegratörün GİB'e bildirdiği adresten indiriyor; alınamayanlar
 * `faulty_invoices`'ta bekliyor. Teşhis ucu bir domainin örnek adreslerini **iki yoldan** dener:
 *
 * - **gib-hw** (101.44.33.54) — entegratörlerin IP izni verdiği aracı,
 * - **k8s** — Gib.Api pod'unun kendisi, doğrudan (NAT çıkışı 213.250.144.198).
 *
 * İki yolun karşılaştırması IP kısıtını diğer nedenlerden ayırır; ikisi de alamazsa neden hata
 * metninden ve gövde imzasından çıkarılır.
 *
 * **Alınan XML boşa gitmez:** örneğin XML'i alınırsa gece sweep'iyle aynı yoldan fatura satırına yazılır ve
 * faulty kaydı kapanır. Domainden en az bir XML alındıysa o domainin bırakılmış kayıtları yeniden açılır
 * (sayaçları sıfırlanır), yani domain yeniden indirilebilir listeye döner.
 *
 * İş tarayıcıda yapılamaz: entegratör adresleri CORS izni vermiyor ve sorun zaten sunucu IP'lerinde.
 * Bu yüzden konsol yalnız domain domain uç çağırır ve raporu toplar (bkz. features/gib/faultyUrlReport.ts).
 */

/** `FaultyUrlHosts` satırı: raporlanmamış faulty kayıtlarının bir domaini. */
export interface FaultyUrlHostSummary {
    host: string;
    /** Gece sweep'inin denediği açık kayıt. */
    pendingCount: number;
    /** Bırakılmış ama raporlanmamış kayıt (sweep seyrek dener). */
    abandonedCount: number;
    packCount: number;
    firstDate?: string | null;
    lastDate?: string | null;
    avgFailedNights: number;
}

/** Bir yolun tek adres için gözlemi. */
export interface FaultyUrlProbe {
    isOk: boolean;
    /** k8s: belge sunucusunun HTTP durumu; gib-hw: aracının kendi durumu (429 = hız sınırı). 0 = yanıt yok. */
    statusCode: number;
    /** xml, zip, pdf, html, json, metin, bos; gövde yoksa boş. */
    kind?: string;
    detail?: string;
    isAccessDenied: boolean;
    timedOut: boolean;
    throttled: boolean;
    usedLegacyTls: boolean;
    elapsedMs: number;
}

export interface FaultyUrlSampleDiagnosis {
    url: string;
    invoiceDate: string;
    docType: string;
    packNo?: number | null;
    failedNightCount: number;
    isAbandoned: boolean;
    /** Neden kodu (ör. `IpRestricted`); metni `reasonText`. */
    reason: string;
    reasonText: string;
    hw: FaultyUrlProbe;
    direct: FaultyUrlProbe;
    /** XML fatura satırına yazıldı, faulty kaydı kapandı. */
    recovered: boolean;
    /** "satır güncellendi (k8s)", "yazılamadı: …", "yalnız PDF alındı…"; denenmediyse boş. */
    recoveryNote: string;
}

export interface FaultyUrlHostDiagnosis {
    host: string;
    sampleCount: number;
    /** Süre bütçesi dolmadan denenen örnek. */
    triedCount: number;
    hwOkCount: number;
    directOkCount: number;
    /** Domain kararı: denenen örneklerde en çok çıkan neden. */
    verdict: string;
    verdictText: string;
    reasonCounts: Record<string, number>;
    samples: FaultyUrlSampleDiagnosis[];
    /** Doğrudan denemeyi yapan pod'un adı. */
    directVantage: string;
    elapsedSeconds: number;
    /** Bu teşhiste XML'i yazılıp kapanan kayıt. */
    recoveredCount: number;
    /** Domainden XML alındığı için yeniden açılan bırakılmış kayıt. */
    reopenedCount: number;
}

function authHeaders(token: string | null | undefined): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getFaultyUrlHosts(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    signal?: AbortSignal,
): Promise<ApiResult<FaultyUrlHostSummary[]>> {
    return getJson<FaultyUrlHostSummary[]>(gibEndpoints.faultyUrlHosts(gibApiBaseUrl), signal, authHeaders(token));
}

/** Tek domain; sunucu en çok ~70 sn'de döner (Cloudflare 100 sn sınırının altında). */
export function diagnoseFaultyUrlHost(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    host: string,
    sampleCount: number,
    signal?: AbortSignal,
): Promise<ApiResult<FaultyUrlHostDiagnosis>> {
    return postJson<FaultyUrlHostDiagnosis>(
        gibEndpoints.diagnoseFaultyUrlHost(gibApiBaseUrl, host, sampleCount),
        {},
        signal,
        authHeaders(token),
    );
}
