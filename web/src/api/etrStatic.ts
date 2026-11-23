/**
 * Etr-static servisi: e-Fatura / e-İrsaliye kayıtlı kullanıcı listesi (GİB mükellef listesi).
 *
 * Servis kimlik istemez, her kökene CORS açıktır; tarayıcıdan doğrudan çağrılır. Liste yenileme
 * GİB'in listesini indirip yazdığı için uzun sürer (Cloudflare'in 100 sn sınırını aşardı, 524):
 * uç işi arka planda başlatıp hemen döner, ilerleme `/status` ile izlenir. Aynı anda tek iş koşar.
 */

import { getJson } from './http';
import type { ApiResult } from './http';

/** Yenilenebilen iki liste: `refreshInvoiceUsers` (liste 1) ve `refreshInvoiceUsers2` (liste 2). */
export type RefreshKind = 'users1' | 'users2';

export const REFRESH_PATH: Record<RefreshKind, string> = {
    users1: 'etr/refreshInvoiceUsers',
    users2: 'etr/refreshInvoiceUsers2',
};

export interface RefreshStart {
    isOk: boolean;
    /** "started" ya da "already running". */
    message: string;
}

export interface RefreshStatus {
    running: boolean;
    startedUtc: string | null;
    finishedUtc: string | null;
    isOk: boolean | null;
    message: string | null;
}

/** Kayıtlı kullanıcı satırı (`DbtEinvoiceUserDto`). */
export interface EtrUser {
    id: string;
    identifier: string;
    title: string;
    alias: string;
    type: string;
    firstCreationTime: string;
    aliasCreationTime: string;
    accountType: string;
}

export function startRefresh(baseUrl: string, kind: RefreshKind, signal?: AbortSignal): Promise<ApiResult<RefreshStart>> {
    return getJson<RefreshStart>(`${baseUrl}/${REFRESH_PATH[kind]}`, signal);
}

/**
 * Servis boş alanları yazmaz (WhenWritingNull): hiç çalışmamış işte yalnız `{ "running": false }` gelir.
 * Alanlar burada null'a tamamlanır; yoksa "bitiş yok" ile "bitti" karışır.
 */
export function normalizeRefreshStatus(raw: Partial<RefreshStatus> | null): RefreshStatus | null {
    if (!raw) {
        return null;
    }

    return {
        running: raw.running === true,
        startedUtc: raw.startedUtc ?? null,
        finishedUtc: raw.finishedUtc ?? null,
        isOk: raw.isOk ?? null,
        message: raw.message ?? null,
    };
}

export async function getRefreshStatus(
    baseUrl: string,
    kind: RefreshKind,
    signal?: AbortSignal,
): Promise<ApiResult<RefreshStatus>> {
    const result = await getJson<Partial<RefreshStatus>>(`${baseUrl}/${REFRESH_PATH[kind]}/status`, signal);

    return { ...result, data: normalizeRefreshStatus(result.data) };
}

/** VKN (10) ya da TCKN (11) mi. */
export function isValidIdentifier(value: string): boolean {
    return /^\d{10,11}$/.test(value.trim());
}

export type LookupKind = 'invoice' | 'despatch';

/** Kayıtlı kullanıcı listesinden numaraya göre sorgu: e-Fatura ya da e-İrsaliye. */
export function lookupUsers(
    baseUrl: string,
    kind: LookupKind,
    identifier: string,
    signal?: AbortSignal,
): Promise<ApiResult<EtrUser[]>> {
    const path = kind === 'invoice' ? 'getInvoiceUserListByTax' : 'getDespatchUserListByTax';

    return getJson<EtrUser[]>(`${baseUrl}/etr/${path}/${encodeURIComponent(identifier.trim())}`, signal);
}

/** Servisin ayakta olduğunu gösteren sağlık ucu: düz metin döner ("Dbt Static Api works! ... (sürüm) ..."). */
export interface HealthResult {
    isUp: boolean;
    status: number;
    elapsedMs: number;
    version: string | null;
    error: string;
}

/** `etr/test` yanıtından sürüm: "... works! (EtrController) - (1.2.3) - 638..." → "1.2.3". */
export function parseHealthVersion(text: string): string | null {
    const match = /\)\s*-\s*\(([^)]+)\)/.exec(text);

    return match ? match[1].trim() : null;
}

export async function checkHealth(baseUrl: string, signal?: AbortSignal): Promise<HealthResult> {
    const startedAt = performance.now();
    const result = await getJson<unknown>(`${baseUrl}/etr/test`, signal);
    const elapsedMs = Math.round(performance.now() - startedAt);

    return {
        isUp: result.isSuccess && /works/i.test(result.content),
        status: result.status,
        elapsedMs,
        version: result.isSuccess ? parseHealthVersion(result.content) : null,
        error: result.isSuccess ? '' : result.error || 'Servise ulaşılamadı',
    };
}
