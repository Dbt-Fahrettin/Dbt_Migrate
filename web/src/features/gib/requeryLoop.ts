import { describeGibFailure } from '../../api/gibClient';
import { requeryPackInvoices } from '../../api/gibRequery';
import type { PackRequeryRequest, PackRequeryUnitResult } from '../../api/gibRequery';
import type { ApiResult } from '../../api/http';
import type { PackRequeryResult } from '../../api/gibRequery';

/**
 * Paket yeniden sorgusunun imleç döngüsü — React'ten bağımsız, bu yüzden testlenebilir.
 *
 * Sunucu işi parçalıyor: her çağrı `BudgetSeconds` kadar birim işliyor ve kaldığı yeri
 * `NextCursor` ile dönüyor. Döngü `HasMore` bitene kadar çağrıyı tekrarlıyor.
 *
 * **İlerleme nasıl hesaplanıyor:** `TotalUnitCount` işin tamamındaki birim sayısı (payda, her
 * çağrıda aynı), `ProcessedUnitCount` ise yalnız o çağrıda işlenen birim sayısı. İmleç sıfırdan
 * başladığı için çağrıların toplamı mutlak konumu veriyor.
 */

/** Ekranda tutulan en fazla birim satırı; uzun koşularda bellek şişmesin. */
export const MAX_UNIT_ROWS = 500;

/**
 * Art arda bu kadar başarısız çağrıdan sonra durulur.
 *
 * Gerekçe: sunucu hata durumunda `NextCursor = gelen cursor` ve `HasMore = true` dönüyor
 * ("ayni Cursor ile yeniden cagirabilirsiniz"). Kalıcı bir hatada bu sonsuz döngü demek.
 */
export const MAX_CONSECUTIVE_FAILURES = 3;

export interface RequeryProgress {
    packNo: number;
    startDate: string;
    endDate: string;
    taxPayerCount: number;
    /** İşin tamamındaki birim sayısı (ilerlemenin paydası). */
    totalUnits: number;
    /** Şu ana kadar işlenen birim sayısı (çağrıların toplamı). */
    processedUnits: number;
    errorUnits: number;
    invoiceCount: number;
    fromCacheCount: number;
    newContentCount: number;
    withoutContentCount: number;
    skippedTaxPayers: string[];
    /** Sunucudan dönen birim satırları, en yenisi sonda (MAX_UNIT_ROWS ile sınırlı). */
    units: PackRequeryUnitResult[];
    /** Kaç kez uca gidildi. */
    callCount: number;
    /** Sunucunun bildirdiği toplam süre. */
    elapsedSeconds: number;
    /** Son yanıtın mesajı. */
    message: string;
}

export type RunState = 'idle' | 'running' | 'done' | 'stopped' | 'failed';

export function emptyProgress(packNo: number, startDate: string): RequeryProgress {
    return {
        packNo,
        startDate,
        endDate: '',
        taxPayerCount: 0,
        totalUnits: 0,
        processedUnits: 0,
        errorUnits: 0,
        invoiceCount: 0,
        fromCacheCount: 0,
        newContentCount: 0,
        withoutContentCount: 0,
        skippedTaxPayers: [],
        units: [],
        callCount: 0,
        elapsedSeconds: 0,
        message: '',
    };
}

export type RequeryCall = (
    gibApiBaseUrl: string,
    token: string | null | undefined,
    request: PackRequeryRequest,
) => Promise<ApiResult<PackRequeryResult>>;

export interface RequeryLoopOptions {
    gibApiBaseUrl: string;
    token: string | null | undefined;
    request: PackRequeryRequest;
    /** true dönerse yeni çağrı açılmaz; koşan çağrı kendi bütçesinde biter. */
    shouldStop: () => boolean;
    onProgress: (progress: RequeryProgress) => void;
    onError: (message: string) => void;
    /** Testlerde uç yerine sahte çağrı geçmek için. */
    call?: RequeryCall;
}

export async function runRequeryLoop(options: RequeryLoopOptions): Promise<RunState> {
    const { gibApiBaseUrl, token, request, shouldStop, onProgress, onError } = options;
    const call = options.call ?? requeryPackInvoices;

    const accumulated = emptyProgress(request.packNo, request.startDate);

    onProgress({ ...accumulated });

    let cursor: string | undefined = request.cursor;
    let consecutiveFailures = 0;

    for (;;) {
        const result = await call(gibApiBaseUrl, token, { ...request, cursor });

        // Taşıma katmanı hatası (ağ, 401, 404…): yanıt gövdesi yok.
        if (!result.isSuccess || !result.data) {
            consecutiveFailures += 1;

            const message = describeGibFailure(result);

            // 401'de yeniden denemenin anlamı yok: belirteç kendiliğinden tazelenmiyor.
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES || result.status === 401) {
                onError(message);

                return 'failed';
            }

            onError(`${message} (yeniden deneniyor ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);

            continue;
        }

        const data = result.data;

        accumulated.callCount += 1;
        accumulated.endDate = data.endDate;
        accumulated.taxPayerCount = data.taxPayerCount;
        accumulated.totalUnits = data.totalUnitCount;
        accumulated.processedUnits += data.processedUnitCount;
        accumulated.errorUnits += data.errorUnitCount;
        accumulated.invoiceCount += data.invoiceCount;
        accumulated.fromCacheCount += data.fromCacheCount;
        accumulated.newContentCount += data.newContentCount;
        accumulated.withoutContentCount += data.withoutContentCount;
        accumulated.elapsedSeconds += data.elapsedSeconds;
        accumulated.message = data.message;

        for (const skipped of data.skippedTaxPayers ?? []) {
            if (!accumulated.skippedTaxPayers.includes(skipped)) {
                accumulated.skippedTaxPayers.push(skipped);
            }
        }

        accumulated.units = [...accumulated.units, ...(data.units ?? [])].slice(-MAX_UNIT_ROWS);

        onProgress({ ...accumulated, skippedTaxPayers: [...accumulated.skippedTaxPayers] });

        // Sunucu iş mantığı hatası: gövde döner ama IsOk false ve imleç ilerlemez.
        if (!data.isOk) {
            consecutiveFailures += 1;

            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                onError(data.message || 'Paket yeniden sorgusu başarısız.');

                return 'failed';
            }

            onError(`${data.message} (yeniden deneniyor ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
        } else {
            consecutiveFailures = 0;
            onError('');
        }

        if (!data.hasMore) {
            return 'done';
        }

        if (shouldStop()) {
            return 'stopped';
        }

        // İmleç ilerlemediyse ve hata da yoksa sonsuz döngüye girmeyelim.
        if (data.isOk && data.processedUnitCount === 0 && (data.nextCursor ?? undefined) === cursor) {
            onError('Sunucu ilerleme bildirmedi (imleç aynı kaldı); döngü durduruldu.');

            return 'failed';
        }

        cursor = data.nextCursor ?? undefined;
    }
}
