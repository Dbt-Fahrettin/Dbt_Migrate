import { endpoints } from '../api/endpoints';
import { runMigrationHistory, runMigrationTracking } from './migrationReports';
import { runPortalDocCounts, runPortalEBookUsage } from './portalReports';
import { invalidVkns, runEBelgeScan, runEBookScan, runUsageReport } from './portalUsage';
import type { OperationLog } from './operationLog';
import { getRangeTarget, resolvePackTargets } from './packTargets';
import { runQueuedOperation } from './queuedOperation';
import { runFunctionRenew, runUpdateSalerId } from './syncOperations';

/**
 * Ekrandaki "İşlem" listesi. Numaralar WPF sürümündeki etiketlerle aynı tutuldu ki alışkanlık
 * bozulmasın.
 *
 * WPF listesinde ayrıca 3-Run Sql, 4-Check Migrate Id ve 5-Revert Migrate maddeleri vardı; o üçünün
 * "Çalıştır" dalları boştu (tıklayınca hiçbir şey olmuyordu), bu yüzden taşınmadı.
 */
export const OPERATION_KINDS = {
    migrate: 0,
    dbtMigrate: 1,
    functionRenew: 2,
    updateSalerId: 6,
    migrationHistory: 7,
    migrationTracking: 8,
    portalDocCounts: 9,
    portalEBookUsage: 10,
    portalEBookScan: 11,
    portalUsageReport: 12,
    portalEBelgeScan: 13,
} as const;

export type OperationKind = (typeof OPERATION_KINDS)[keyof typeof OPERATION_KINDS];

export interface OperationDefinition {
    kind: OperationKind;
    /** Listede görünen ad — mesajlarda da bu kullanılır. */
    name: string;
    description: string;
    /**
     * Hiçbir şey yazmayan işlemler. Prod'da yazma onayı istenmez — okumak için paket aralığını
     * elle yazdırmak, onayı gereksiz yere sıradanlaştırır.
     */
    isReadOnly: boolean;
}

export const OPERATIONS: OperationDefinition[] = [
    {
        kind: OPERATION_KINDS.migrate,
        name: '0-Migrate',
        description: 'EF migration, paket başına kuyruk',
        isReadOnly: false,
    },
    {
        kind: OPERATION_KINDS.dbtMigrate,
        name: '1-Dbt-Migrate',
        description: 'seçili Dbt migration, paket başına kuyruk',
        isReadOnly: false,
    },
    {
        kind: OPERATION_KINDS.functionRenew,
        name: '2-Function Renew',
        description: 'toplam fonksiyonu yenileme (6 eşzamanlı)',
        isReadOnly: false,
    },
    {
        kind: OPERATION_KINDS.updateSalerId,
        name: '6-Update SalerId',
        description: 'satışçı id güncelleme (sıralı)',
        isReadOnly: false,
    },
    {
        kind: OPERATION_KINDS.migrationHistory,
        name: '7-Migration Geçmişi',
        description: 'tek paketin __dbt_migrations_history kayıtları',
        isReadOnly: true,
    },
    {
        kind: OPERATION_KINDS.migrationTracking,
        name: '8-Migration Takip',
        description: 'bir migration’ın paket paket durumu',
        isReadOnly: true,
    },
    {
        kind: OPERATION_KINDS.portalDocCounts,
        name: '9-Portal E-Belge Sayıları',
        description: 'devadonusum portalındaki tüm mükelleflerin belge adetleri, türe göre (paket kullanılmaz)',
        isReadOnly: true,
    },
    {
        kind: OPERATION_KINDS.portalEBookUsage,
        name: '10-Portal E-Defter Kullanımı',
        description: 'portaldaki tüm mükelleflerin e-Defter yükleme adedi ve harcanan alanı, ay ay (paket kullanılmaz)',
        isReadOnly: true,
    },
    {
        kind: OPERATION_KINDS.portalEBookScan,
        name: '11-E-Defter Boyutlarını Güncelle',
        description:
            'mükelleflerin kendi e-Defter kimlikleriyle portalı tarar, dönem başına MB/adet/durumu Login kullanım tablosuna yazar (arka plan işi)',
        isReadOnly: false,
    },
    {
        kind: OPERATION_KINDS.portalUsageReport,
        name: '12-Portal Kullanım Raporu',
        description: 'Login kullanım tablosundan ay ay mükellef/adet/MB toplamları; tüm satırlar Excel (CSV) olarak iner',
        isReadOnly: true,
    },
    {
        kind: OPERATION_KINDS.portalEBelgeScan,
        name: '13-E-Belge Sayılarını Güncelle',
        description:
            'mükelleflerin kendi e-belge kullanıcılarıyla her ay ve türde (e-Fatura, e-Arşiv, e-İrsaliye, e-SMM, e-MM) adet sayar, Login kullanım tablosuna yazar (arka plan işi)',
        isReadOnly: false,
    },
];

/** Devatek portalının bayi geneli raporları: paket kutularını (Start/End) kullanmaz, oturum belirteci ister. */
export function isPortalOperation(kind: OperationKind): boolean {
    return (
        kind === OPERATION_KINDS.portalDocCounts ||
        kind === OPERATION_KINDS.portalEBookUsage ||
        isPortalUsageOperation(kind)
    );
}

/** Mükellef bazında kullanım işlemleri: aylar tarih kutularından, isteğe bağlı VKN/TCKN listesi. */
export function isPortalUsageOperation(kind: OperationKind): boolean {
    return (
        kind === OPERATION_KINDS.portalEBookScan ||
        kind === OPERATION_KINDS.portalEBelgeScan ||
        kind === OPERATION_KINDS.portalUsageReport
    );
}

/** Paket kutularını (Start/End) kullanan işlemler. */
export function usesPackTargets(kind: OperationKind): boolean {
    return !isPortalOperation(kind);
}

export interface OperationRequest {
    apiBaseUrl: string;
    log: OperationLog;
    /** Listede seçili işlem adı ("1-Dbt-Migrate" gibi) — mesajlarda kullanılır. */
    operationName: string;
    /** Start kutusu. */
    startText: string;
    /** End kutusu. */
    endText: string;
    /** Sunucudan çekilmiş veritabanı adları; doluysa var olmayan paketler atlanır. */
    datNames: string[] | null;
    /** Ağır işler için aralık modu: paket başına iş yerine tek sıralı iş. */
    isBetweenMode: boolean;
    /** Dbt-Migrate ve Migration Takip işlemlerinde kullanılacak migration adı. */
    dbtMigrationName: string;
    /** Function Renew işleminde yenilenecek fonksiyon adı (serbest metin). */
    functionName: string;
    /** Update SalerId işleminde evrak tarih aralığı — ISO (yyyy-MM-dd). */
    docStartDate: string;
    docEndDate: string;
    /** Migration Takip işleminde yalnız eksik/hatalı paketleri listele. */
    onlyMissing: boolean;
    /** Portal raporlarında mükellef bazında listeyi de getir. */
    withTaxpayers: boolean;
    /** Login.Api giriş belirteci — yalnız `[Authorize]` altındaki portal uçlarında gönderilir. */
    token: string;
    /** Portal kullanım işlemlerinde VKN/TCKN listesi (virgül/boşluk ayraçlı); boşsa hepsi. */
    vknText: string;
    signal: AbortSignal;
}

/** Seçilen işlemi çalıştırmadan önceki doğrulama; uygunsa null döner. */
export function validateRequest(kind: OperationKind, request: OperationRequest): string | null {
    if (isPortalOperation(kind)) {
        if (!request.token) {
            return 'Oturum belirteci yok — çıkış yapıp tekrar girin.';
        }

        if (!request.docStartDate || !request.docEndDate) {
            return 'Başlangıç ve bitiş tarihi zorunlu.';
        }

        if (request.docStartDate > request.docEndDate) {
            return 'Başlangıç tarihi bitiş tarihinden sonra olamaz.';
        }

        if (isPortalUsageOperation(kind)) {
            const invalid = invalidVkns(request.vknText);

            if (invalid.length > 0) {
                return `VKN/TCKN 10 ya da 11 hane olmalı: ${invalid.slice(0, 5).join(', ')}`;
            }
        }

        return null;
    }

    if (!request.startText.trim()) {
        return 'Start kutusu boş olamaz (0 = Dbt_Temp).';
    }

    if (!Number.isInteger(Number.parseInt(request.startText.trim(), 10))) {
        return 'Start kutusuna sayı yazın (0 = Dbt_Temp).';
    }

    if (
        (kind === OPERATION_KINDS.dbtMigrate || kind === OPERATION_KINDS.migrationTracking) &&
        !request.dbtMigrationName.trim()
    ) {
        return 'Dbt Migrate Name seçilmedi!';
    }

    if (kind === OPERATION_KINDS.functionRenew && !request.functionName.trim()) {
        return 'Function Name boş olamaz!';
    }

    if (kind === OPERATION_KINDS.updateSalerId) {
        if (!request.docStartDate || !request.docEndDate) {
            return 'Evrak başlangıç ve bitiş tarihi zorunlu.';
        }

        if (request.docStartDate > request.docEndDate) {
            return 'Evrak başlangıç tarihi bitiş tarihinden sonra olamaz.';
        }
    }

    return null;
}

/**
 * 0-Migrate — EF migration'larını (ve onlara bağlı, henüz uygulanmamış Dbt migration'larını)
 * sunucuda Hangfire kuyruğunda koşturur ve durumunu izler.
 */
export async function runMigrate(request: OperationRequest): Promise<void> {
    const { apiBaseUrl, log, signal } = request;

    log.setOperation(`Migration (kuyruk) - ${endpoints.migrateBg(apiBaseUrl, '')}`);

    const targets = await resolvePackTargets(
        apiBaseUrl,
        request.startText,
        request.endText,
        request.datNames,
        signal,
    );

    // Aralık modu: paket başına iş açmak yerine tüm aralık için tek sıralı iş.
    const rangeTarget = getRangeTarget(targets, request.isBetweenMode);

    if (rangeTarget) {
        const rangeUrl = endpoints.migrateBetweenBg(apiBaseUrl, rangeTarget.packNo, rangeTarget.packNoEnding);

        await runQueuedOperation({
            apiBaseUrl,
            log,
            operationName: request.operationName,
            headerText: rangeUrl,
            targets: [rangeTarget],
            buildEnqueueUrl: () => rangeUrl,
            signal,
        });

        return;
    }

    await runQueuedOperation({
        apiBaseUrl,
        log,
        operationName: request.operationName,
        headerText: endpoints.migrateBg(apiBaseUrl, '…'),
        targets,
        buildEnqueueUrl: (target) => endpoints.migrateBg(apiBaseUrl, target.packNo),
        signal,
    });
}

/** 1-Dbt-Migrate — seçili Dbt migration'ını sunucuda Hangfire kuyruğunda koşturur ve izler. */
export async function runDbtMigrate(request: OperationRequest): Promise<void> {
    const { apiBaseUrl, log, signal } = request;

    const migrationName = request.dbtMigrationName.trim();

    log.setOperation(`Dbt-Migration (kuyruk) - ${endpoints.dbtMigrateAllBg(apiBaseUrl, '…', migrationName)}`);

    const targets = await resolvePackTargets(
        apiBaseUrl,
        request.startText,
        request.endText,
        request.datNames,
        signal,
    );

    const rangeTarget = getRangeTarget(targets, request.isBetweenMode);

    if (rangeTarget) {
        const rangeUrl = endpoints.dbtMigrateBetweenBg(
            apiBaseUrl,
            rangeTarget.packNo,
            rangeTarget.packNoEnding,
            migrationName,
        );

        await runQueuedOperation({
            apiBaseUrl,
            log,
            operationName: request.operationName,
            headerText: rangeUrl,
            targets: [rangeTarget],
            buildEnqueueUrl: () => rangeUrl,
            signal,
        });

        return;
    }

    await runQueuedOperation({
        apiBaseUrl,
        log,
        operationName: request.operationName,
        headerText: `${endpoints.dbtMigrateAllBg(apiBaseUrl, '…', migrationName)}`,
        targets,
        buildEnqueueUrl: (target) => endpoints.dbtMigrateAllBg(apiBaseUrl, target.packNo, migrationName),
        signal,
    });
}

export function runOperation(kind: OperationKind, request: OperationRequest): Promise<void> {
    switch (kind) {
        case OPERATION_KINDS.migrate:
            return runMigrate(request);

        case OPERATION_KINDS.dbtMigrate:
            return runDbtMigrate(request);

        case OPERATION_KINDS.functionRenew:
            return runFunctionRenew(request);

        case OPERATION_KINDS.updateSalerId:
            return runUpdateSalerId(request);

        case OPERATION_KINDS.migrationHistory:
            return runMigrationHistory(request);

        case OPERATION_KINDS.migrationTracking:
            return runMigrationTracking(request);

        case OPERATION_KINDS.portalDocCounts:
            return runPortalDocCounts(request);

        case OPERATION_KINDS.portalEBookUsage:
            return runPortalEBookUsage(request);

        case OPERATION_KINDS.portalEBookScan:
            return runEBookScan(request);

        case OPERATION_KINDS.portalUsageReport:
            return runUsageReport(request);

        case OPERATION_KINDS.portalEBelgeScan:
            return runEBelgeScan(request);

        default:
            return Promise.resolve();
    }
}
