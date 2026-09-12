/**
 * "Beni hatırla" — kalıcı oturum.
 *
 * SAKLANAN: giriş yanıtı (id, em, rl, lat) + son kullanma zamanı + hangi Login.Api'den geldiği.
 * SAKLANMAYAN: şifre. Hiçbir yere yazılmaz.
 *
 * Oturum anahtarı ORTAM ADI DEĞİL, Login.Api adresidir. Local ve Test aynı Login.Api'yi
 * kullandığı için oturumları ortaktır; Prod ayrı adres olduğu için ayrı oturum ister.
 *
 * Bu bir güvenlik sınırı DEĞİLDİR: Service.Api'nin master uçları kimlik doğrulaması istemiyor,
 * yani giriş kişiyi doğrular, api çağrılarını korumaz. Kalıcı oturum yalnız kolaylıktır —
 * cihaza erişen biri konsolu açabilir. Prod'un süresi (12 saat) bu yüzden kısa tutuldu.
 */

import type { LoginResponse } from './types';
import { isAuthenticatedResponse } from './types';

const STORAGE_PREFIX = 'dbt-admin-session:';
const LAST_ENV_KEY = 'dbt-admin-last-env';
const LAST_LOGIN_NAME_KEY = 'dbt-admin-last-login-name';

interface StoredSession {
    user: LoginResponse;
    /** Unix ms. */
    expiresAt: number;
    loginApiBaseUrl: string;
}

function storageKey(loginApiBaseUrl: string): string {
    return `${STORAGE_PREFIX}${loginApiBaseUrl}`;
}

/** localStorage bazı bağlamlarda (gizli pencere, site verisi kapalı) erişimde hata fırlatır. */
function safeGet(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSet(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        /* yok sayılır — oturum yalnız bu sekme boyunca yaşar */
    }
}

function safeRemove(key: string): void {
    try {
        window.localStorage.removeItem(key);
    } catch {
        /* yok sayılır */
    }
}

export function saveSession(loginApiBaseUrl: string, user: LoginResponse, ttlHours: number): void {
    const session: StoredSession = {
        user,
        expiresAt: Date.now() + ttlHours * 60 * 60 * 1000,
        loginApiBaseUrl,
    };

    safeSet(storageKey(loginApiBaseUrl), JSON.stringify(session));
}

/**
 * Kayıtlı oturumu okur. Süresi dolmuşsa ya da bozuksa siler ve null döner.
 * Yetki kontrolü burada YAPILMAZ — çağıran tarafta tekrar uygulanır ki kural
 * daraltıldığında eski oturumlar geçersiz olsun.
 */
export function loadSession(loginApiBaseUrl: string): LoginResponse | null {
    const raw = safeGet(storageKey(loginApiBaseUrl));

    if (!raw) {
        return null;
    }

    let session: StoredSession | null = null;

    try {
        session = JSON.parse(raw) as StoredSession;
    } catch {
        session = null;
    }

    if (!session || !isAuthenticatedResponse(session.user)) {
        clearSession(loginApiBaseUrl);

        return null;
    }

    if (!session.expiresAt || session.expiresAt <= Date.now()) {
        clearSession(loginApiBaseUrl);

        return null;
    }

    return session.user;
}

export function clearSession(loginApiBaseUrl: string): void {
    safeRemove(storageKey(loginApiBaseUrl));
}

/** Son kullanılan ortam — giriş ekranı bununla açılır. */
export function loadLastEnvKey(): string | null {
    return safeGet(LAST_ENV_KEY);
}

export function saveLastEnvKey(key: string): void {
    safeSet(LAST_ENV_KEY, key);
}

/** Kullanıcı adı kolaylık olsun diye ayrıca hatırlanır; şifre asla. */
export function loadLastLoginName(): string {
    return safeGet(LAST_LOGIN_NAME_KEY) ?? '';
}

export function saveLastLoginName(value: string): void {
    safeSet(LAST_LOGIN_NAME_KEY, value);
}
