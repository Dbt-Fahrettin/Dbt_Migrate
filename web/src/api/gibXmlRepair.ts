import { gibEndpoints } from './endpoints';
import { postJson } from './http';
import type { ApiResult } from './http';

/**
 * Gib.Api — başka mükellefin satırına yazılmış XML'lerin onarımı (`GibInvoiceQuery/RepairCrossWrittenXml`).
 *
 * Eski faulty kurtarma yolu ETTN'siz kayıtta satırı yalnız fatura numarasıyla arıyor ve XML'i aynı numaralı bütün boş
 * satırlara yazıyordu; GİB portal numaraları mükellefler arasında tekrar ettiği için bir belge başka firmaların
 * listesinde görünebiliyordu (09.10.2026: 284 XML, 831 satır, 331 firma şüpheli).
 *
 * Onarım her şüpheli satırı XML'in kendisine göre sınar: sahibi olan satıra dokunulmaz; olmayanın XML'i boşaltılır ve
 * satırın kendi adresinden doğru XML yeniden alınır. Belgenin gerçek sahibinin boş satırı da doldurulur.
 * `dryRun` hiçbir şey yazmaz.
 */

export interface CrossWrittenXmlRowAction {
    id: string;
    packNo?: number | null;
    faturaNo: string;
    /** "gelen" / "giden"; gerçek sahip satırlarında boş. */
    direction: string;
    docType: string;
    /** Kaldı, Temizlenecek, YenidenYazıldı, Boş kaldı, Doğrulanamadı, Sahibine yazılacak/yazıldı, Sahibi yok. */
    action: string;
    note: string;
}

export interface CrossWrittenXmlRepairResult {
    isDryRun: boolean;
    groupCount: number;
    rowCount: number;
    ownerRows: number;
    wrongRows: number;
    clearedRows: number;
    refetchedRows: number;
    leftEmptyRows: number;
    unverifiableRows: number;
    ownerFilledRows: number;
    ownerAlreadyStored: number;
    ownerMissing: number;
    nextHash: string;
    hasMore: boolean;
    elapsedSeconds: number;
    rows: CrossWrittenXmlRowAction[];
}

export function repairCrossWrittenXml(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    dryRun: boolean,
    afterHash: string,
    maxGroups: number,
    signal?: AbortSignal,
): Promise<ApiResult<CrossWrittenXmlRepairResult>> {
    return postJson<CrossWrittenXmlRepairResult>(
        gibEndpoints.repairCrossWrittenXml(gibApiBaseUrl, dryRun, afterHash, maxGroups),
        {},
        signal,
        token ? { Authorization: `Bearer ${token}` } : {},
    );
}
