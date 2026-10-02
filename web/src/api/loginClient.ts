import { loginUrl } from './endpoints';
import { describeError } from './http';
import type { LoginRequest, LoginResponse } from '../auth/types';
import { PRG_TYPE_DBT_ADMIN_WEB, isAuthenticatedResponse } from '../auth/types';

/**
 * Login.Api üzerinden kullanıcı adı + parola ile kimlik doğrulama.
 *
 * Uç ve program tipi, çalışan yönetim istemcisiyle (Devatek.Admin → Pages/Entry/Login.razor.cs)
 * birebir aynı: POST api/token/login2 + prgType 20. Başarı ölçütü de aynı:
 * yanıt boş değil VE Id != Guid.Empty. Kullanıcı bulunamazsa sunucu 404 döner.
 *
 * Parola düz metin gider — özeti sunucu üretip karşılaştırıyor. Bu yüzden Login.Api'ye
 * https şart; Local ortamda bile login-test.unideva.com'a gidilmesinin sebebi bu.
 */

export const INVALID_CREDENTIALS_MESSAGE =
    'Kullanıcı adı ya da şifre yanlış! Lütfen bilgilerinizi kontrol edip tekrar deneyiniz.';

export interface LoginResult {
    isSuccess: boolean;
    user: LoginResponse | null;
    message: string;
}

function fail(message: string): LoginResult {
    return { isSuccess: false, user: null, message };
}

export async function login(
    loginApiBaseUrl: string,
    loginNameOrEmail: string,
    password: string,
    signal?: AbortSignal,
): Promise<LoginResult> {
    if (!loginApiBaseUrl) {
        return fail('Login.Api adresi yapılandırılmamış (config/environments.ts).');
    }

    const request: LoginRequest = {
        loginNameOrEmail: loginNameOrEmail.trim(),
        password,
        prgType: PRG_TYPE_DBT_ADMIN_WEB,
    };

    let response: Response;

    try {
        response = await fetch(loginUrl(loginApiBaseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal,
        });
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        return fail(`Login servisine ulaşılamadı: ${describeError(error)}`);
    }

    // Sunucu, kullanıcı bulunamadığında NotFound döndürüyor.
    if (response.status === 404) {
        return fail(INVALID_CREDENTIALS_MESSAGE);
    }

    if (!response.ok) {
        return fail(`Login servisi beklenmeyen yanıt verdi (HTTP ${response.status}).`);
    }

    const body = await response.text();

    let user: LoginResponse | null = null;

    if (body.trim()) {
        try {
            user = JSON.parse(body) as LoginResponse;
        } catch (error) {
            return fail(`Login yanıtı çözümlenemedi: ${describeError(error)}`);
        }
    }

    if (!isAuthenticatedResponse(user)) {
        // Bakım penceresinde sunucu kimlik yerine yalnız bakım başlığını döndürür.
        if (user?.mit?.trim()) {
            return fail(`Sistem bakımda: ${user.mit}`);
        }

        return fail(INVALID_CREDENTIALS_MESSAGE);
    }

    return { isSuccess: true, user, message: '' };
}
