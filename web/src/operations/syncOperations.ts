import { endpoints } from '../api/endpoints';
import { getJson } from '../api/http';
import { forEachBounded } from './boundedConcurrency';
import type { OperationLog } from './operationLog';
import { resolvePackTargets } from './packTargets';
import { beginSequential, finishSequential, isOkResponse, reportNoTargets } from './sequentialOperation';
import { emptyCounters } from './types';

/**
 * Senkron uçlu işlemler: `2-Function Renew` ve `6-Update SalerId`.
 *
 * Bu ikisi Hangfire kuyruğuna iş atmaz, doğrudan sonucu döndüren uca gider — yani izlenecek bir
 * jobId yoktur, sonuç isteğin kendisinden okunur.
 */

/** Function Renew'de aynı anda koşan istek sayısı (WPF ve Blazor sürümleriyle aynı). */
const FUNCTION_RENEW_PARALLELISM = 6;

/** Update SalerId paketler arasında bekler: uç ağır ve sıralı koşması isteniyor. */
const SEQUENTIAL_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SyncOperationRequest {
    apiBaseUrl: string;
    log: OperationLog;
    operationName: string;
    startText: string;
    endText: string;
    datNames: string[] | null;
    /** Function Renew'de yenilenecek fonksiyon adı. */
    functionName: string;
    /** Update SalerId'de evrak tarih aralığı — ISO (yyyy-MM-dd). */
    docStartDate: string;
    docEndDate: string;
    signal: AbortSignal;
}

/** 2-Function Renew — toplam fonksiyonunu paket başına yeniler. En fazla 6 istek aynı anda koşar. */
export async function runFunctionRenew(request: SyncOperationRequest): Promise<void> {
    const { apiBaseUrl, log, operationName, signal } = request;

    const headerUrl = endpoints.setTotalFunction(apiBaseUrl, '…', request.functionName.trim());

    const counters = emptyCounters();

    log.setCounters(counters);
    log.setOperation(`Set Function - ${headerUrl}`);

    beginSequential(log, operationName, headerUrl);

    const targets = await resolvePackTargets(
        apiBaseUrl,
        request.startText,
        request.endText,
        request.datNames,
        signal,
    );

    if (targets.length === 0) {
        reportNoTargets(log, operationName);

        return;
    }

    counters.queued = targets.length;
    counters.pending = targets.length;
    log.setCounters(counters);

    await forEachBounded(targets, FUNCTION_RENEW_PARALLELISM, async (target) => {
        if (signal.aborted) {
            return;
        }

        const url = endpoints.setTotalFunction(apiBaseUrl, target.packNo, request.functionName.trim());

        const result = await getJson(url, signal);

        if (result.isSuccess) {
            counters.success += 1;

            log.addLine(`${target.displayName} --> ${result.content}`);
        } else {
            counters.error += 1;

            log.addLine(`${target.displayName} --> HATALI`);
            log.addError(`${target.displayName} - ${result.error || `Status Code: ${result.status}`}`);
        }

        counters.pending = targets.length - counters.success - counters.error;
        log.setCounters(counters);

        log.setOperation(
            `${operationName} - Devam ediyor | Başarılı: ${counters.success} | Hatalı: ${counters.error}`,
        );

        log.setStatus(`${operationName} - Devam ediyor`, 'running');
    });

    finishSequential(log, operationName, counters);
}

/** 6-Update SalerId — satışçı id'lerini evrak tarih aralığına göre paket başına günceller. Sıralı koşar. */
export async function runUpdateSalerId(request: SyncOperationRequest): Promise<void> {
    const { apiBaseUrl, log, operationName, signal } = request;

    const headerUrl = endpoints.updateSalerPackCompanies(
        apiBaseUrl,
        '…',
        request.docStartDate,
        request.docEndDate,
    );

    const counters = emptyCounters();

    log.setCounters(counters);
    log.setOperation(`Update SalerId - ${headerUrl}`);

    beginSequential(log, operationName, headerUrl);

    const targets = await resolvePackTargets(
        apiBaseUrl,
        request.startText,
        request.endText,
        request.datNames,
        signal,
    );

    if (targets.length === 0) {
        reportNoTargets(log, operationName);

        return;
    }

    counters.queued = targets.length;
    counters.pending = targets.length;
    log.setCounters(counters);

    for (const target of targets) {
        if (signal.aborted) {
            log.addLine('         işlem durduruldu');

            break;
        }

        const url = endpoints.updateSalerPackCompanies(
            apiBaseUrl,
            target.packNo,
            request.docStartDate,
            request.docEndDate,
        );

        log.setOperation(`${operationName} - ${url}`);
        log.setStatus(`${operationName} - Devam ediyor (${target.displayName})`, 'running');

        const result = await getJson(url, signal);

        // Başarı alan olarak okunur; WPF gövdede ham metin arıyordu (bkz. isOkResponse).
        if (result.isSuccess && isOkResponse(result.content)) {
            counters.success += 1;

            log.addLine(`${target.displayName} - ok - ${new Date().toLocaleString('tr-TR')}`);
        } else {
            counters.error += 1;

            log.addLine(`${target.displayName} --> HATALI`);
            log.addError(`${target.displayName} - ${result.error || `Status Code: ${result.status}`}`);
        }

        counters.pending = targets.length - counters.success - counters.error;
        log.setCounters(counters);

        await delay(SEQUENTIAL_DELAY_MS);
    }

    finishSequential(log, operationName, counters);
}
