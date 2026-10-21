/**
 * Otomatik DBS gönderiminin sunucu tarafındaki durumu.
 *
 * İki ayrı anahtar aynı adı taşıyor ve karıştırılması 2026-10-21'de canlıda bir şikâyete yol açtı:
 *
 *  1. **Sunucu anahtarı** — `DbsAutoSend:Enabled` (ortamda `DbsAutoSend__Enabled`). Kapalıyken hiçbir
 *     şey gönderilmez. Bu modülün okuduğu değer budur.
 *  2. **Firma ayarı** — paket veritabanında `frm.multifolds` (`RevenueAutoSendAfterSave` /
 *     `ExpenseAutoSendAfterSave`), masaüstünden kaydedilir. Kullanıcının "Evet" gördüğü ayar budur.
 *
 * Firma ayarı açıkken sunucu anahtarı kapalıysa kullanıcı ayarı açık görür ama hiçbir şey gitmez.
 * Ekranın varlık sebebi tam olarak bu farkı görünür kılmak.
 *
 * Sunucu anahtarı **bu ekrandan açılıp kapatılamaz**: değer ortam değişkeninden okunuyor, değişmesi
 * için k8s manifesti düzenlenip und-svc yeniden yayınlanmalı.
 */

import { endpoints } from './endpoints';
import { getJson } from './http';
import type { ApiResult } from './http';
import { serviceKeyHeaders } from './serviceKey';

export interface DbsAutoSendStatus {
    /** Yapılandırmadaki anahtar. */
    isEnabled: boolean;

    /** Geliştirme modunda ayrıca yerel deneme bayrağı gerekir. */
    isAllowedInThisEnvironment: boolean;

    /** İkisi birden: iş gerçekten çalışıyor mu. */
    isActive: boolean;

    /** Pilot paketler; boş dize "tüm paketler" demek. */
    packNos: string;
    packNoList: number[];

    delayMinutes: number;
    maxDelayMinutes: number;
    sweepMinutes: number;
    batchSize: number;
    maxDocumentsPerCompany: number;
    requestDelayMs: number;

    /** Kuyruğun tutulduğu paket. */
    queuePackNo: number;

    /** Bu andan önce kaydedilmiş kayıtlar otomatik gönderilmez. */
    sinceDateUtc: string;

    testPackUserEmails: string;

    /** Entegratör anahtarı yapılandırmada tanımlı mı (değeri dönmez). */
    hasIntegratorConfig: boolean;

    isSendJobRegistered: boolean;
    isSweepJobRegistered: boolean;
    sendJobLastExecutionUtc: string | null;
    sendJobNextExecutionUtc: string | null;

    queueName: string;
}

export function getDbsAutoSendStatus(
    apiBaseUrl: string,
    signal?: AbortSignal,
): Promise<ApiResult<DbsAutoSendStatus>> {
    return getJson<DbsAutoSendStatus>(
        endpoints.dbsAutoSendStatus(apiBaseUrl),
        signal,
        serviceKeyHeaders(apiBaseUrl),
    );
}

/**
 * Hatayı okunur hâle getirir.
 *
 * 404 burada iki şey demek olabilir ve ikisi de "uç yok" gibi görünür: servis anahtarı eksik/yanlış
 * (ServiceKeyRequired bilerek 404 döner) ya da ucun olmadığı eski bir sunucu sürümü. Kullanıcıyı
 * yanlış yöne göndermemek için ikisini de söylüyoruz.
 */
export function describeDbsStatusFailure(result: ApiResult<DbsAutoSendStatus>): string {
    if (result.status === 404) {
        return (
            'Sunucu 404 döndü. İki sebebi olabilir: servis anahtarı eksik ya da yanlış ' +
            '(Migration İşlemleri ekranındaki "Servis anahtarı" alanı), ya da bu ortamdaki sürüm ' +
            'henüz bu ucu içermiyor — Service.Api yayını bekleniyor.'
        );
    }

    if (result.status === 0) {
        return result.error || 'Servise ulaşılamadı.';
    }

    return result.error || `Status Code: ${result.status}`;
}
