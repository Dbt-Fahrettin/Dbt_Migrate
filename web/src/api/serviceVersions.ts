/**
 * Servislerin yayındaki sürümünü okuyan uçlar.
 *
 * Üç servisin de `[AllowAnonymous]` bir `test` ucu var ve tek satırlık bir tanıtım dizesi
 * döndürüyor. Kimlik doğrulaması, servis anahtarı, gövde yok — yalnız GET. Sorulan şey
 * "bu ortamda hangi sürüm koşuyor"; veritabanına dokunmuyorlar.
 *
 *   Unideva Service Api (2610.16.1) works! - (6879) - 639277327063458551
 *   Unideva.Gib.Api (2610.13.2) works! - 639277327077291867
 *   Devatek.Login (2610.16.1) works! - 639277327085475224
 *
 * Service.Api'nin ikinci parantezi (6879) sürüm değil; bu yüzden ayrıştırma "works!" ten
 * önceki ilk parantezi alır. Biçim bozulursa sürüm boş kalır ve ham satır olduğu gibi gösterilir —
 * ekranın "bilinmiyor" demesi, yanlış bir sayı göstermesinden iyidir.
 *
 * Adresler `unideva-versions/functions/index.js` içindeki `SERVICES` listesiyle aynı uçlardır
 * (durum sayfası da bunları yokluyor), ama liste oraya bağlı değil: burada ortam tanımlarından
 * türetiliyor ki yeni bir ortam eklendiğinde tek yer değişsin.
 */

import { ENVIRONMENTS, type EnvKey, type ServiceEnvironment } from '../config/environments';
import { endpoints } from './endpoints';
import { getJson } from './http';
import type { ApiResult } from './http';

export type ServiceId = 'svc' | 'gib' | 'login';

export interface ServiceDefinition {
    id: ServiceId;

    /** Ekranda görünen ad. */
    name: string;

    /** Ne işe yaradığı — tek satır. */
    description: string;

    /** Ortam tanımındaki hangi adres kullanılacak. */
    baseUrlOf: (environment: ServiceEnvironment) => string;
}

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
    {
        id: 'svc',
        name: 'Service.Api',
        description: 'Ana uygulama servisi',
        baseUrlOf: (environment) => environment.apiBaseUrl,
    },
    {
        id: 'gib',
        name: 'Gib.Api',
        description: 'GİB / e-Fatura servisi',
        baseUrlOf: (environment) => environment.gibApiBaseUrl,
    },
    {
        id: 'login',
        name: 'Login.Api',
        description: 'Program girişi',
        baseUrlOf: (environment) => environment.loginApiBaseUrl,
    },
];

/**
 * Sürümü sorulacak ortamlar: Test ve Prod.
 *
 * `desktopOnly` olan Local dışarıda — telefondan zaten erişilemez ve sorulan soru
 * "yayındaki sürüm ne" olduğu için geliştirme makinesinin cevabı anlamsız. Kural ortam
 * tanımından okunuyor, burada ikinci bir liste tutulmuyor.
 */
export const VERSION_ENVIRONMENTS: ServiceEnvironment[] = ENVIRONMENTS.filter((d) => !d.desktopOnly);

/** Satır (servis) + sütun (ortam) için tek anahtar. */
export function versionCellKey(serviceId: ServiceId, envKey: EnvKey): string {
    return `${serviceId}:${envKey}`;
}

export function serviceVersionUrl(service: ServiceDefinition, environment: ServiceEnvironment): string {
    return endpoints.test(service.baseUrlOf(environment));
}

export interface VersionBanner {
    /** Servisin kendi bildirdiği ad — beklenenden farklıysa yanlış adrese bakılıyor demektir. */
    appName: string;
    version: string;
}

/**
 * Tanıtım satırından adı ve sürümü çıkarır; biçim tutmazsa null.
 *
 * `works!` koşulu bilerek var: Service.Api satırında sürümden sonra ikinci bir parantez
 * daha geliyor ve onsuz hangi parantezin sürüm olduğu belirsiz kalırdı.
 */
export function parseVersionBanner(raw: string): VersionBanner | null {
    const match = /^\s*(.+?)\s*\(([^)]+)\)\s*works!/i.exec(raw);

    if (!match) {
        return null;
    }

    return { appName: match[1].trim(), version: match[2].trim() };
}

export function fetchServiceVersion(url: string, signal?: AbortSignal): Promise<ApiResult> {
    return getJson(url, signal);
}
