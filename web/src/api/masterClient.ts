import { endpoints } from './endpoints';
import { getJson, postJson } from './http';
import type { ApiResult } from './http';
import type { JobStatus } from '../operations/types';

/**
 * Service.Api'nin master uçlarına giden çağrılar.
 *
 * Not: bu uçlar kimlik doğrulaması istemiyor, bu yüzden istekler Authorization başlığı taşımıyor.
 * Uçlara auth eklendiğinde tek değişecek yer burasıdır (girişte alınan LoginResponse.lat).
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
    return getJson(endpoints.dbtDatNames(apiBaseUrl, prefix), signal);
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
    return getJson(endpoints.dbtMigrations(apiBaseUrl), signal);
}

/**
 * Bekleyen işlerin durumunu toplu uçtan okur.
 *
 * Geçici ağ/servis hatasında null döner — işler sunucuda koşmaya devam eder, çağıran
 * sonraki turda tekrar sorar. Hata fırlatmaz; izleme döngüsü tek bir aksaklıkta ölmemeli.
 */
export async function getStatusesBulk(apiBaseUrl: string, jobIds: string[]): Promise<JobStatus[] | null> {
    const result = await postJson<JobStatus[]>(endpoints.migrateStatusBulk(apiBaseUrl), jobIds);

    if (!result.isSuccess || !Array.isArray(result.data)) {
        return null;
    }

    return result.data;
}
