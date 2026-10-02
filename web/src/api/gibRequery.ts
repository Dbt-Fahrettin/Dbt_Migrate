import { gibEndpoints } from './endpoints';
import { postJson } from './http';
import type { ApiResult } from './http';

/**
 * Gib.Api — paket yeniden sorgusu (`GibInvoiceQuery/RequeryPackInvoices`).
 *
 * Paketin mükelleflerini bir tarih aralığında gece sorgusundan bağımsız yeniden sorgular:
 * içeriği alınmış faturalar atlanır, listeye yeni gelen ya da içeriği alınamamış faturaların
 * içeriği güncel kurallarla istenir. Damga yazmaz.
 *
 * **İş imleçle parçalanır.** Sunucu `BudgetSeconds` kadar yeni birim başlatır, sonra kaldığı yeri
 * `NextCursor` ile döner. İstemci `HasMore` false olana dek imleci geri gönderir. Sunucuda ayrıca
 * 540 sn sert sınır var; bu yüzden tek bir istek sonsuza kadar sürmez.
 */

export interface PackRequeryRequest {
    packNo: number;

    /** Bu günden itibaren sorgulanır (ISO yyyy-MM-dd). */
    startDate: string;

    /** Boşsa sunucu verisi hazır en yeni günü kullanır. */
    endDate?: string;

    /** Yalnız bu VKN/TCKN'li mükellef; boşsa paketin bütün mükellefleri. */
    taxNumberOrIdn?: string;

    /** Bir GİB çağrısının kapsadığı gün sayısı (1-31, sunucu varsayılanı 7). */
    chunkDays?: number;

    /** Bu çağrıda yeni birim başlatılabilecek süre (30-480 sn, sunucu varsayılanı 240). */
    budgetSeconds?: number;

    /** Önceki yanıtın NextCursor'ı; ilk çağrıda boş. */
    cursor?: string;
}

/** Tek bir "mükellef × tarih parçası × belge türü" biriminin sonucu. */
export interface PackRequeryUnitResult {
    taxPayer: string;
    kind: string;
    startDate: string;
    endDate: string;
    isOk: boolean;
    invoiceCount: number;
    fromCacheCount: number;
    newContentCount: number;
    withoutContentCount: number;
    elapsedSeconds: number;
    message?: string | null;
}

export interface PackRequeryResult {
    isOk: boolean;
    message: string;
    packNo: number;
    startDate: string;
    endDate: string;
    taxPayerCount: number;

    /** İşin TAMAMINDAKİ birim sayısı — her çağrıda aynı gelir, ilerleme paydası budur. */
    totalUnitCount: number;

    /** YALNIZ BU ÇAĞRIDA işlenen birim sayısı; istemci bunları toplayarak konumu bulur. */
    processedUnitCount: number;

    errorUnitCount: number;
    invoiceCount: number;
    fromCacheCount: number;
    newContentCount: number;
    withoutContentCount: number;
    skippedTaxPayers: string[];
    units: PackRequeryUnitResult[];
    nextCursor?: string | null;
    hasMore: boolean;
    elapsedSeconds: number;
}

export function requeryPackInvoices(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    request: PackRequeryRequest,
    signal?: AbortSignal,
): Promise<ApiResult<PackRequeryResult>> {
    return postJson<PackRequeryResult>(
        gibEndpoints.requeryPackInvoices(gibApiBaseUrl),
        request,
        signal,
        token ? { Authorization: `Bearer ${token}` } : {},
    );
}
