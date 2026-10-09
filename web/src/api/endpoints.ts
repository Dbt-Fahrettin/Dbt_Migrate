/**
 * Service.Api'nin çağrılan uçları — tek kaynak.
 *
 * Kaynak: Dbt_Migrate (WPF) ve Dbt_Admin_Console/Core/MasterApiClient.cs.
 * Buraya yalnız adres kurma işi girer; çağrı ve hata yorumlama http.ts'te.
 */

function join(apiBaseUrl: string, path: string): string {
    return `${apiBaseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export const endpoints = {
    /** Servisin ayakta olup olmadığı. */
    test: (api: string) => join(api, 'test'),

    /** Dbt_{prefix}% ile eşleşen veritabanı adları. */
    dbtDatNames: (api: string, prefix: string) => join(api, `master/get-dbtdatnames/${prefix}`),

    /** Sunucudaki Dbt migration adları (1-Dbt-Migrate açılır listesi). */
    dbtMigrations: (api: string) => join(api, 'master/get-dbt-migrations'),

    /**
     * RESX fonksiyon adları (2-Function Renew).
     * Not: hem Test hem Prod'da boş dizi dönüyor — bu yüzden ekranda serbest metin kalmalı.
     */
    resFunctions: (api: string) => join(api, 'master/get-res-functions'),

    /** 0-Migrate — EF migration, paket başına kuyruk. */
    migrateBg: (api: string, packNo: string) => join(api, `master/migrate-bg/${packNo}`),

    migrateBetweenBg: (api: string, start: string, end: string) =>
        join(api, `master/migrate-between-bg/${start}/${end}`),

    /** 1-Dbt-Migrate — seçili Dbt migration, paket başına kuyruk. */
    dbtMigrateAllBg: (api: string, packNo: string, migrationName: string) =>
        join(api, `master/dbt-migrate-all-bg/${packNo}/${migrationName}`),

    dbtMigrateBetweenBg: (api: string, start: string, end: string, migrationName: string) =>
        join(api, `master/dbt-migrate-between-bg/${start}/${end}/${migrationName}`),

    /** Kuyruğa alınan işlerin toplu durum sorgusu (POST, gövde = jobId listesi). */
    migrateStatusBulk: (api: string) => join(api, 'master/dbt-migrate-status-bulk'),

    /** 2-Function Renew. */
    setTotalFunction: (api: string, packNo: string, functionName: string) =>
        join(api, `master/set-total-function/${packNo}/${functionName}`),

    /** 6-Update SalerId. */
    updateSalerPackCompanies: (api: string, packNo: string, startDate: string, endDate: string) =>
        join(api, `dbtRenewal/updateSalerPackCompanies/${packNo}/${startDate}/${endDate}`),

    /** 7-Migration Geçmişi — tek paketin __dbt_migrations_history kayıtları. */
    migrationHistory: (api: string, packNo: string) => join(api, `master/dbt-migration-history/${packNo}`),

    /** 8-Migration Takip — bir migration'ın paket paket durumu. */
    migrationPacks: (api: string, packNoStarting: string, migrationName: string, onlyMissing: boolean) =>
        `${join(api, `master/dbt-migration-packs/${packNoStarting}/${migrationName}`)}?onlyMissing=${onlyMissing}`,

    /**
     * 9-Portal E-Belge Sayıları — `[Authorize]` altında (Login.Api belirteci). Tarihler ISO (yyyy-MM-dd);
     * sunucu DateOnly olarak bağlar.
     */
    undPortalDocCounts: (api: string, startDate: string, endDate: string, detail: boolean) =>
        `${join(api, `UndPortal/etr-doc-counts/${startDate}/${endDate}`)}?detail=${detail}`,

    /** 10-Portal E-Defter Kullanımı — ay ay yükleme adedi ve harcanan alan; `[Authorize]` altında. */
    undPortalEBookUsage: (api: string, startDate: string, endDate: string, detail: boolean) =>
        `${join(api, `UndPortal/ebook-usage/${startDate}/${endDate}`)}?detail=${detail}`,

    /**
     * 11-E-Defter Boyutlarını Güncelle — mükellef bazında tarama işini başlatır (POST, gövde = VKN listesi; boş = tümü).
     * Aylar yyyy-MM.
     */
    undPortalEBookScan: (api: string, startMonth: string, endMonth: string) =>
        join(api, `UndPortal/ebook-scan/${startMonth}/${endMonth}`),

    /** 13-E-Belge Sayılarını Güncelle — mükellef bazında e-belge adet taraması (POST, gövde = VKN listesi). */
    undPortalEBelgeScan: (api: string, startMonth: string, endMonth: string) =>
        join(api, `UndPortal/ebelge-scan/${startMonth}/${endMonth}`),

    /**
     * 14-Portal E-Belge Sayıları (bayi) — portal REST API'siyle bayinin bütün aktif müşterileri (Login'den bağımsız);
     * POST, gövde = VKN listesi (boş = hepsi).
     */
    undPortalRestScan: (api: string, startMonth: string, endMonth: string) =>
        join(api, `UndPortal/portal-ebelge-scan/${startMonth}/${endMonth}`),

    /** 15-Portal E-Defter Boyutları (bayi) — bayinin bütün aktif müşterileri, müşteri adına geçişle PortalExt. */
    undPortalRestEBookScan: (api: string, startMonth: string, endMonth: string) =>
        join(api, `UndPortal/portal-ebook-scan/${startMonth}/${endMonth}`),

    /** Tarama işinin durumu ve ilerlemesi. */
    undPortalScanStatus: (api: string, jobId: string) => join(api, `UndPortal/scan-status/${encodeURIComponent(jobId)}`),

    /**
     * 12-Portal Kullanım Raporu — Login'deki kullanım tablosu; tür/kaynak boşsa hepsi (kaynak 1 = bayi taraması), VKN
     * listesi virgülle.
     */
    undPortalUsageReport: (
        api: string,
        startMonth: string,
        endMonth: string,
        docType: number | null,
        vkns: string[],
        source: number | null = null,
    ) => {
        const query = new URLSearchParams();

        if (docType != null) {
            query.set('docType', String(docType));
        }

        if (source != null) {
            query.set('source', String(source));
        }

        if (vkns.length > 0) {
            query.set('vkns', vkns.join(','));
        }

        const suffix = query.toString();

        return `${join(api, `UndPortal/usage-report/${startMonth}/${endMonth}`)}${suffix ? `?${suffix}` : ''}`;
    },
};

/**
 * Gib.Api — gece sorgulama servisinin çalışma zamanı anahtarı.
 *
 * Service.Api'nin master uçlarının aksine bu ikisi `[Authorize]` altında: servis internete
 * açık ve bu uçlar bir belge sorgulamıyor, servisin kendi anahtarını çeviriyor. Kimliksiz
 * erişilebilir olsaydı biri gece sorgusunu kapatıp sessiz veri kaybına yol açabilirdi.
 */
export const gibEndpoints = {
    nightlyState: (gibApi: string) => join(gibApi, 'GibInvoiceQuery/GetNightlyQueryState'),
    setNightlyState: (gibApi: string) => join(gibApi, 'GibInvoiceQuery/SetNightlyQueryState'),

    /**
     * Paket yeniden sorgusu. Uzun iş; imleçle parçalanır (bkz. api/gibRequery.ts).
     * Bu uç da `[Authorize]` altında: bir çağrı paketin bütün mükellefleri adına GİB'e
     * onlarca istek atıyor.
     */
    requeryPackInvoices: (gibApi: string) => join(gibApi, 'GibInvoiceQuery/RequeryPackInvoices'),

    /**
     * XML kolon boşaltma işi. Sunucu tarafında arka plan servisi; bu uçlar yalnız
     * durumu okur ve anahtarı çevirir (bkz. api/gibPurge.ts).
     */
    purgeJob: (gibApi: string) => join(gibApi, 'GibXmlStore/purge-job'),
    startPurgeJob: (gibApi: string) => join(gibApi, 'GibXmlStore/purge-job/start'),
    stopPurgeJob: (gibApi: string) => join(gibApi, 'GibXmlStore/purge-job/stop'),

    /**
     * XML'i alınamayan belge adreslerinin domain teşhisi (bkz. api/gibFaultyUrl.ts). İkisi de `[Authorize]`
     * altında: teşhis ucu entegratör sunucularına istek atıyor.
     */
    faultyUrlHosts: (gibApi: string) => join(gibApi, 'GibInvoiceQuery/FaultyUrlHosts'),

    /**
     * Başka mükellefin satırına yazılmış XML'lerin onarımı (bkz. api/gibXmlRepair.ts). `[Authorize]`: veri siler.
     * İmleçle parçalanır: `afterHash` önceki yanıtın `nextHash`'i.
     */
    repairCrossWrittenXml: (gibApi: string, dryRun: boolean, afterHash: string, maxGroups: number) =>
        `${join(gibApi, 'GibInvoiceQuery/RepairCrossWrittenXml')}?${new URLSearchParams({
            dryRun: String(dryRun),
            afterHash,
            maxGroups: String(maxGroups),
        }).toString()}`,
    diagnoseFaultyUrlHost: (gibApi: string, host: string, sampleCount: number) =>
        `${join(gibApi, 'GibInvoiceQuery/DiagnoseFaultyUrlHost')}?${new URLSearchParams({
            host,
            sampleCount: String(sampleCount),
        }).toString()}`,
};

/** Login.Api: kullanıcı adı + şifre doğrulama. */
export function loginUrl(loginApiBaseUrl: string): string {
    return join(loginApiBaseUrl, 'token/login2');
}
