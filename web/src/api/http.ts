/**
 * Tek fetch sarmalayıcısı.
 *
 * WPF sürümünde isteklere "Connection: keep-alive" ve "Keep-Alive: 600" başlıkları ekleniyordu.
 * Tarayıcı fetch'i bu ikisini yasaklı başlık sayar; üstelik HTTP/1.1'de bağlantı sürekliliği
 * zaten varsayılan, yani WPF'te de bir etkileri yoktu. Buraya taşınmadı — eklemeyin.
 */

export interface ApiResult<T = unknown> {
    isSuccess: boolean;
    status: number;
    /** Ham gövde — hata satırlarında olduğu gibi gösterilir. */
    content: string;
    data: T | null;
    error: string;
}

/** Exception'ı WPF'teki gibi iç mesajıyla birlikte okunur hale getirir. */
export function describeError(error: unknown): string {
    if (error instanceof Error) {
        const cause = error.cause;

        if (cause instanceof Error && cause.message && cause.message !== error.message) {
            return `${error.message} - ${cause.message}`;
        }

        return error.message;
    }

    return String(error);
}

async function toResult<T>(response: Response): Promise<ApiResult<T>> {
    const content = await response.text();

    let data: T | null = null;

    if (content) {
        try {
            data = JSON.parse(content) as T;
        } catch {
            data = null;
        }
    }

    return {
        isSuccess: response.ok,
        status: response.status,
        content,
        data,
        error: response.ok ? '' : `Status Code: ${response.status} -- ${content}`,
    };
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<ApiResult<T>> {
    try {
        const response = await fetch(url, { method: 'GET', signal });

        return await toResult<T>(response);
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        return { isSuccess: false, status: 0, content: '', data: null, error: describeError(error) };
    }
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        });

        return await toResult<T>(response);
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        return { isSuccess: false, status: 0, content: '', data: null, error: describeError(error) };
    }
}
