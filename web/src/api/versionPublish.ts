/**
 * Versiyon kaydı (Login.Api `admin/save-version`).
 *
 * Uç yalnız Devatek personeli / Konsol için açıktır ve ölçüm kipine bakmaz: yüksek numaralı zorunlu bir kayıt bütün
 * istemcilerin girişini kapatabilir, WPF bazı güncelleme yollarında kurulumu kayıttaki adresten indirip çalıştırır.
 * Konsol girişte aldığı Login.Api belirtecini (`lat`) Bearer olarak gönderir.
 */

import { postJson } from './http';
import type { ApiResult } from './http';
import type { DbtVersionPayload } from '../features/versionpublish/versionPublishModel';

/** Sunucunun `DevaLoginResult` yanıtının kullanılan alanları. */
export interface SaveVersionResult {
    isOK?: boolean;
    isOk?: boolean;
    message?: string | null;
}

export function saveVersion(
    loginApiBaseUrl: string,
    token: string | null | undefined,
    payload: DbtVersionPayload,
    signal?: AbortSignal,
): Promise<ApiResult<SaveVersionResult>> {
    return postJson<SaveVersionResult>(
        `${loginApiBaseUrl.replace(/\/+$/, '')}/admin/save-version`,
        payload,
        signal,
        token ? { Authorization: `Bearer ${token}` } : undefined,
    );
}

/** Yanıtı kullanıcıya söylenecek bir sonuca çevirir; boş dönerse kayıt yazıldı demektir. */
export function describeSaveFailure(result: ApiResult<SaveVersionResult>): string {
    if (result.status === 401) {
        return 'Yetki reddedildi (401). Giriş belirtecinin süresi dolmuş olabilir — çıkış yapıp tekrar girin.';
    }

    if (result.status === 403) {
        return 'Bu işlem yalnız Devatek personeline açık (403). Hesabınızın personel olarak tanındığından emin olun.';
    }

    if (!result.isSuccess) {
        return result.error || 'Login servisine ulaşılamadı.';
    }

    const ok = result.data?.isOK ?? result.data?.isOk ?? false;

    if (ok) {
        return '';
    }

    return result.data?.message || 'Kayıt yazılamadı; bilgileri kontrol edip tekrar deneyin.';
}
