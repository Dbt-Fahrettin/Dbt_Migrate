/**
 * Konsolun bağlanabileceği ortamlar — tek kaynak.
 *
 * WPF sürümünde bu tablo her düğmenin içinde ayrı bir if/else zinciri olarak tekrar ediyordu
 * (GetApiBaseUrl bir yerde, ExequteRunQl_Click kendi kopyasını taşıyordu). Burada tek yerde durur.
 *
 * "Pre Test" ve "PreProd" 12.09.2026'da kaldırıldı: Pre Test ortamı artık kullanılmıyor,
 * PreProd ise zaten Test ile aynı adrese gidiyordu.
 */

export type EnvKey = 'local' | 'test' | 'prod';

export interface ServiceEnvironment {
    key: EnvKey;

    /** Listede görünen ad. */
    name: string;

    /** Service.Api kökü — sonunda / olmadan. */
    apiBaseUrl: string;

    /**
     * Gib.Api kökü.
     *
     * Ayrı bir servis ve ayrı bir adres: prod/test'te ingress `/gib/` yolundan geçiyor,
     * lokalde kendi portunda (5225) koşuyor.
     *
     * Service.Api'nin master uçlarının aksine gece sorgusu uçları `[Authorize]` altında.
     * Login.Api ile Gib.Api aynı JWT imzalama anahtarını paylaştığı için (ortam bazında
     * doğrulandı) girişte alınan belirteç burada geçerlidir.
     */
    gibApiBaseUrl: string;

    /**
     * Girişin doğrulanacağı Login.Api kökü.
     *
     * Local ve Test aynı Login.Api'yi kullanır; bu yüzden oturumları da ortaktır
     * (bkz. session.ts — oturum anahtarı ortam adı değil, bu adrestir).
     * Prod ayrı Login.Api kullandığı için ayrı oturum ister: Test'ten Prod'a geçmek
     * yeniden giriş demektir. Yanlış ortamda işlem başlatmaya karşı kasıtlı bir kilit.
     */
    loginApiBaseUrl: string;

    /** true ise işlem başlamadan önce ek onay istenir. */
    requiresConfirmation: boolean;

    /**
     * "Beni hatırla" süresi. Prod kısa tutuldu: master uçları kimlik doğrulaması istemediği için
     * kalıcı oturum bir güvenlik sınırı değil, yalnız kolaylıktır — cihaza erişen biri konsolu açar.
     */
    sessionTtlHours: number;

    /**
     * Mobil pakette (Capacitor) gizlenir. localhost telefondan zaten erişilemez.
     */
    desktopOnly: boolean;
}

export const ENVIRONMENTS: ServiceEnvironment[] = [
    {
        key: 'local',
        name: 'Local',
        apiBaseUrl: 'http://localhost:44305/api',
        gibApiBaseUrl: 'http://localhost:5225/api',
        loginApiBaseUrl: 'https://login-test.unideva.com/api',
        requiresConfirmation: false,
        sessionTtlHours: 24 * 30,
        desktopOnly: true,
    },
    {
        key: 'test',
        name: 'Test',
        apiBaseUrl: 'https://test.unideva.com/svc/api',
        gibApiBaseUrl: 'https://test.unideva.com/gib/api',
        loginApiBaseUrl: 'https://login-test.unideva.com/api',
        requiresConfirmation: false,
        sessionTtlHours: 24 * 30,
        desktopOnly: false,
    },
    {
        key: 'prod',
        name: 'Prod',
        apiBaseUrl: 'https://hw.unideva.com/svc/api',
        gibApiBaseUrl: 'https://hw.unideva.com/gib/api',
        loginApiBaseUrl: 'https://login.unideva.com/api',
        requiresConfirmation: true,
        sessionTtlHours: 12,
        desktopOnly: false,
    },
];

export const DEFAULT_ENV_KEY: EnvKey = 'test';

/**
 * Bu cihazda seçilebilecek ortamlar.
 *
 * Native pakette (Android/iOS) `Local` gizlenir: http://localhost:44305 telefondan erişilemez,
 * listede durması yalnız yanlış seçime davetiye olur.
 */
export function visibleEnvironments(isNative: boolean): ServiceEnvironment[] {
    return ENVIRONMENTS.filter((d) => !d.desktopOnly || !isNative);
}

/** Seçili ortam bu cihazda kullanılamıyorsa varsayılana düşer. */
export function resolveEnvKey(key: string | null | undefined, isNative: boolean): EnvKey {
    const found = visibleEnvironments(isNative).find((d) => d.key === key);

    return found ? found.key : DEFAULT_ENV_KEY;
}

/** Konsolu kullanabilmek için gereken en düşük rol: 0 Müşteri, 5 Bayi, 9 Devatek. */
export const MINIMUM_ROLE = 9;

/** Doluysa rol kontrolüne ek olarak yalnız bu adresler girebilir. */
export const ALLOWED_EMAILS: string[] = [];

export function getEnvironment(key: EnvKey): ServiceEnvironment {
    const found = ENVIRONMENTS.find((d) => d.key === key);

    if (!found) {
        throw new Error(`Bilinmeyen ortam: ${key}`);
    }

    return found;
}

/**
 * Konsol https üzerinden açılmışken http bir servise çağrı, tarayıcı tarafından mixed-content
 * olarak engellenir. Capacitor paketinde (native http) bu sorun yoktur.
 */
export function isBlockedByMixedContent(env: ServiceEnvironment): boolean {
    return isMixedContent(env.apiBaseUrl);
}

export function isGibBlockedByMixedContent(env: ServiceEnvironment): boolean {
    return isMixedContent(env.gibApiBaseUrl);
}

function isMixedContent(url: string): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    return window.location.protocol === 'https:' && url.startsWith('http://');
}
