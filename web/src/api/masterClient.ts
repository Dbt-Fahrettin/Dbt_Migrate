import { endpoints } from './endpoints';
import { getJson, postJson } from './http';
import type { ApiResult } from './http';
import { serviceKeyHeaders } from './serviceKey';
import type { ActiveMigrateJobs, JobStatus, MigrateCancelResult } from '../operations/types';

/**
 * Service.Api'nin master uçlarına giden çağrılar.
 *
 * Bu uçlar paket belirteci (Authorization) istemiyor; 13.10.2026'dan beri **servis anahtarı**
 * istiyorlar — `X-Svc-Key`, bkz. `serviceKey.ts`. Anahtar yoksa sunucu 404 döner, "uç yok" gibi
 * görünür. `test` ucu TestController'dadır, anahtar istemez.
 */

/** Sunucu bazen düz dizi, bazen JSON string içinde dizi döndürebiliyor; ikisini de kabul et. */
export function tryReadStringList(content: string): string[] | null {
    if (!content.trim()) {
        return null;
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(content);
    } catch {
        return null;
    }

    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return null;
        }
    }

    if (!Array.isArray(parsed)) {
        return null;
    }

    return parsed.filter((d): d is string => typeof d === 'string');
}

export function testService(apiBaseUrl: string, signal?: AbortSignal): Promise<ApiResult> {
    return getJson(endpoints.test(apiBaseUrl), signal);
}

export function getDbtDatNames(apiBaseUrl: string, prefix: string, signal?: AbortSignal): Promise<ApiResult> {
    return getJson(endpoints.dbtDatNames(apiBaseUrl, prefix), signal, serviceKeyHeaders(apiBaseUrl));
}

/** Yalnız ad listesi lazımsa: hata durumunda boş dizi. */
export async function getDbtDatNamesList(
    apiBaseUrl: string,
    prefix: string,
    signal?: AbortSignal,
): Promise<string[]> {
    const result = await getDbtDatNames(apiBaseUrl, prefix, signal);

    if (!result.isSuccess) {
        return [];
    }

    return tryReadStringList(result.content) ?? [];
}

export function getDbtMigrations(apiBaseUrl: string, signal?: AbortSignal): Promise<ApiResult> {
    return getJson(endpoints.dbtMigrations(apiBaseUrl), signal, serviceKeyHeaders(apiBaseUrl));
}

/**
 * Bekleyen işlerin durumunu toplu uçtan okur.
 *
 * Geçici ağ/servis hatasında null döner — işler sunucuda koşmaya devam eder, çağıran
 * sonraki turda tekrar sorar. Hata fırlatmaz; izleme döngüsü tek bir aksaklıkta ölmemeli.
 */
export async function getStatusesBulk(apiBaseUrl: string, jobIds: string[]): Promise<JobStatus[] | null> {
    const result = await postJson<JobStatus[]>(
        endpoints.migrateStatusBulk(apiBaseUrl),
        jobIds,
        undefined,
        serviceKeyHeaders(apiBaseUrl),
    );

    if (!result.isSuccess || !Array.isArray(result.data)) {
        return null;
    }

    return result.data;
}

/**
 * Sunucuda süren migration işleri. Hata durumunda null döner — bu bilgi yardımcı niteliktedir,
 * okunamaması ekranın açılmasını engellememeli.
 */
export async function getActiveMigrateJobs(
    apiBaseUrl: string,
    signal?: AbortSignal,
): Promise<ActiveMigrateJobs | null> {
    const result = await getJson<ActiveMigrateJobs>(
        endpoints.dbtMigrateActive(apiBaseUrl),
        signal,
        serviceKeyHeaders(apiBaseUrl),
    );

    return result.isSuccess && result.data ? result.data : null;
}

/** İşleri iptal eder. Kuyrukta bekleyen düşer; koşan iş veritabanında bitene kadar sürer. */
export async function cancelMigrateJobs(
    apiBaseUrl: string,
    jobIds: string[],
    signal?: AbortSignal,
): Promise<MigrateCancelResult | null> {
    if (jobIds.length === 0) {
        return { requestedCount: 0, deletedCount: 0, runningCount: 0, items: [] };
    }

    const result = await postJson<MigrateCancelResult>(
        endpoints.dbtMigrateCancel(apiBaseUrl),
        jobIds,
        signal,
        serviceKeyHeaders(apiBaseUrl),
    );

    return result.isSuccess && result.data ? result.data : null;
}
