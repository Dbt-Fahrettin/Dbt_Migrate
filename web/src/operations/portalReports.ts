import { endpoints } from '../api/endpoints';
import { getJson } from '../api/http';
import type { ApiResult } from '../api/http';
import type { OperationLog } from './operationLog';
import { emptyCounters } from './types';

/**
 * Salt okuma: Devatek e-Dönüşüm portalının (service.devadonusum.com) bayi geneli raporları.
 *
 * Service.Api'nin `UndPortal` uçları master uçlarının aksine `[Authorize]` altında — ticari veri
 * döndürüyorlar. Bu yüzden istek Login.Api giriş belirteciyle (`lat`) imzalanır; sunucu ayrıca
 * kullanıcıyı `UndPortal:AllowedUsers` listesinde arar.
 */

/** `UndPortal/etr-doc-counts` yanıtındaki tek belge türü. */
export interface PortalDocTypeCount {
    code: string;
    name: string;
    direction?: string | null;
    docCount: number;
    taxpayerCount: number;
}

/** `UndPortal/etr-doc-counts` yanıtındaki tek mükellef (yalnız detay istendiğinde). */
export interface PortalTaxpayerDocCounts {
    vknTckn?: string | null;
    title?: string | null;
    /** Anahtar: PortalDocTypeCount.code; yalnız sıfırdan büyük adetler. */
    counts: Record<string, number>;
}

export interface PortalDocCountReport {
    isOk: boolean;
    message?: string | null;
    startDate: string;
    endDate: string;
    portalTaxpayerCount: number;
    activeTaxpayerCount: number;
    incomingDocCount: number;
    outgoingDocCount: number;
    totalDocCount: number;
    docTypes: PortalDocTypeCount[];
    taxpayers?: PortalTaxpayerDocCounts[] | null;
    elapsedMs: number;
}

export interface PortalReportRequest {
    apiBaseUrl: string;
    log: OperationLog;
    operationName: string;
    /** Login.Api giriş belirteci. */
    token: string;
    /** ISO (yyyy-MM-dd). */
    docStartDate: string;
    docEndDate: string;
    withTaxpayers: boolean;
    signal: AbortSignal;
}

const numberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

function formatNumber(value: number | null | undefined): string {
    return numberFormat.format(value ?? 0);
}

function authHeaders(token: string): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export function describePortalFailure(result: ApiResult<unknown>): string {
    if (result.status === 401) {
        return 'Yetki reddedildi (401). Giriş belirtecinin süresi dolmuş olabilir — çıkış yapıp tekrar girin.';
    }

    if (result.status === 403) {
        return 'Bu hesap portal raporlarına yetkili değil (403) — sunucuda UndPortal:AllowedUsers listesine eklenmeli.';
    }

    if (result.status === 404) {
        return 'Sunucu sürümü bu ucu içermiyor (404) — Service.Api yayını bekleniyor.';
    }

    return result.error || `Status Code: ${result.status}`;
}

/** Sağa hizalı sayı + sola hizalı metin: log satırları eş genişlikli yazıyla okunur. */
function row(label: string, value: string, extra = ''): string {
    return `${label.padEnd(34, ' ')}${value.padStart(14, ' ')}${extra}`;
}

/**
 * 9-Portal E-Belge Sayıları — tarih aralığında portaldaki tüm mükelleflerin belge adetleri:
 * belge türüne göre toplam adet ve o türden belgesi olan mükellef sayısı.
 */
export async function runPortalDocCounts(request: PortalReportRequest): Promise<void> {
    const { apiBaseUrl, log, operationName, docStartDate, docEndDate } = request;

    const url = endpoints.undPortalDocCounts(apiBaseUrl, docStartDate, docEndDate, request.withTaxpayers);
    const counters = emptyCounters();

    log.setOperation(`Portal E-Belge Sayıları - ${url}`);
    log.setStatus(`${operationName} - Başladı`, 'running');
    log.addLine(`Dönem : ${docStartDate} → ${docEndDate}`);
    log.addLine('         portal sorgulanıyor, birkaç dakika sürebilir...');
    log.flushNow();

    const result = await getJson<PortalDocCountReport>(url, request.signal, authHeaders(request.token));
    const report = result.data;

    if (!result.isSuccess || !report) {
        counters.error += 1;
        log.addLine('Portal raporu alınamadı');
        log.addError(describePortalFailure(result));
    } else if (!report.isOk) {
        counters.error += 1;
        log.addLine('Portal raporu alınamadı');
        log.addError(report.message || 'Sunucu gerekçe bildirmedi.');
    } else {
        writeDocCountReport(log, report);
        counters.success += 1;
    }

    counters.queued = counters.success + counters.error;
    log.setCounters(counters);
    log.setStatus(`${operationName} - Tamamlandı`, counters.error > 0 ? 'failed' : 'succeeded');
    log.flushNow();
}

function writeDocCountReport(log: OperationLog, report: PortalDocCountReport): void {
    log.addLine('');
    log.addLine(row('Portaldaki mükellef', formatNumber(report.portalTaxpayerCount)));
    log.addLine(row('Belgesi olan mükellef', formatNumber(report.activeTaxpayerCount)));
    log.addLine(row('Giden belge', formatNumber(report.outgoingDocCount)));
    log.addLine(row('Gelen belge', formatNumber(report.incomingDocCount)));
    log.addLine(row('Toplam belge', formatNumber(report.totalDocCount)));
    log.addLine('');
    log.addLine(row('Belge türü', 'Adet', '   Mükellef'));
    log.addLine('-'.repeat(60));

    for (const docType of report.docTypes ?? []) {
        const label = docType.direction ? `${docType.name} (${docType.direction})` : docType.name;

        log.addLine(row(label, formatNumber(docType.docCount), `   ${formatNumber(docType.taxpayerCount).padStart(8, ' ')}`));
    }

    const names = new Map((report.docTypes ?? []).map((d) => [d.code, d.direction ? `${d.name} ${d.direction}` : d.name]));

    if (report.taxpayers && report.taxpayers.length > 0) {
        log.addLine('');
        log.addLine(`Mükellefler (${formatNumber(report.taxpayers.length)}) — belge adedine göre`);
        log.addLine('-'.repeat(60));

        for (const taxpayer of report.taxpayers) {
            const parts = Object.entries(taxpayer.counts ?? {}).map(
                ([code, count]) => `${names.get(code) ?? code}: ${formatNumber(count)}`,
            );

            log.addLine(`${(taxpayer.vknTckn ?? '').padEnd(12, ' ')} ${taxpayer.title ?? ''}`);
            log.addLine(`             ${parts.length > 0 ? parts.join(' | ') : 'belge yok'}`);
        }
    }

    log.addLine('');
    log.addLine(`Süre : ${formatNumber(Math.round((report.elapsedMs ?? 0) / 100) / 10)} sn`);
}

export interface PortalEBookMonth {
    month: string;
    startDate: string;
    endDate: string;
    uploadCount: number;
    uploadTaxpayerCount: number;
    usedAreaMb: number;
    areaTaxpayerCount: number;
    error?: string | null;
}

export interface PortalEBookTaxpayer {
    vknTckn?: string | null;
    title?: string | null;
    uploadCount: number;
    usedAreaMb: number;
    areaMb: number;
}

/** `UndPortal/ebook-usage` yanıtı. */
export interface PortalEBookUsageReport {
    isOk: boolean;
    message?: string | null;
    startDate: string;
    endDate: string;
    uploadTaxpayerCount: number;
    uploadCount: number;
    usedAreaMb: number;
    eBookTaxpayerCount: number;
    months: PortalEBookMonth[];
    taxpayers?: PortalEBookTaxpayer[] | null;
    elapsedMs: number;
}

function formatMb(value: number | null | undefined): string {
    return `${numberFormat.format(value ?? 0)} MB`;
}

/**
 * 10-Portal E-Defter Kullanımı — portaldaki tüm mükelleflerin e-Defter kullanımı, ay ay: yükleme adedi,
 * yükleme yapan mükellef ve harcanan alan. Kaynak bayi servisi; defter türü (Y/K/YB/KB/DR) kırılımı yok.
 */
export async function runPortalEBookUsage(request: PortalReportRequest): Promise<void> {
    const { apiBaseUrl, log, operationName, docStartDate, docEndDate } = request;

    const url = endpoints.undPortalEBookUsage(apiBaseUrl, docStartDate, docEndDate, request.withTaxpayers);
    const counters = emptyCounters();

    log.setOperation(`Portal E-Defter Kullanımı - ${url}`);
    log.setStatus(`${operationName} - Başladı`, 'running');
    log.addLine(`Dönem : ${docStartDate} → ${docEndDate}`);
    log.addLine('         portal ay ay sorgulanıyor, birkaç dakika sürebilir...');
    log.flushNow();

    const result = await getJson<PortalEBookUsageReport>(url, request.signal, authHeaders(request.token));
    const report = result.data;

    if (!result.isSuccess || !report) {
        counters.error += 1;
        log.addLine('Portal raporu alınamadı');
        log.addError(describePortalFailure(result));
    } else if (!report.isOk) {
        counters.error += 1;
        log.addLine('Portal raporu alınamadı');
        log.addError(report.message || 'Sunucu gerekçe bildirmedi.');

        // Bütün aylar okunamadığında da sebep ay satırlarında: portalın asıl hata metni burada.
        for (const month of (report.months ?? []).filter((m) => m.error)) {
            log.addError(`${month.month}: ${month.error}`);
        }
    } else {
        writeEBookUsageReport(log, report);

        // Bazı aylar okunamadıysa rapor yine yazılır ama işlem hatalı sayılır: toplamlar eksiktir.
        const failedMonths = (report.months ?? []).filter((m) => m.error);

        if (failedMonths.length > 0) {
            counters.error += 1;

            for (const month of failedMonths) {
                log.addError(`${month.month}: ${month.error}`);
            }
        } else {
            counters.success += 1;
        }
    }

    counters.queued = counters.success + counters.error;
    log.setCounters(counters);
    log.setStatus(`${operationName} - Tamamlandı`, counters.error > 0 ? 'failed' : 'succeeded');
    log.flushNow();
}

function monthLine(month: PortalEBookMonth): string {
    return (
        `${month.month.padEnd(10, ' ')}${formatNumber(month.uploadCount).padStart(12, ' ')}` +
        `${formatNumber(month.uploadTaxpayerCount).padStart(10, ' ')}${formatMb(month.usedAreaMb).padStart(18, ' ')}` +
        `${formatNumber(month.areaTaxpayerCount).padStart(10, ' ')}${month.error ? '   (eksik)' : ''}`
    );
}

function writeEBookUsageReport(log: OperationLog, report: PortalEBookUsageReport): void {
    log.addLine('');
    log.addLine(row('e-Defter alanı tanımlı mükellef', formatNumber(report.eBookTaxpayerCount)));
    log.addLine(row('Yükleme yapan mükellef', formatNumber(report.uploadTaxpayerCount)));
    log.addLine(row('Defter yükleme adedi', formatNumber(report.uploadCount)));
    log.addLine(row('Harcanan alan', formatMb(report.usedAreaMb)));
    log.addLine('');
    log.addLine(
        `${'Ay'.padEnd(10, ' ')}${'Yükleme'.padStart(12, ' ')}${'Mükellef'.padStart(10, ' ')}` +
            `${'Alan'.padStart(18, ' ')}${'Mükellef'.padStart(10, ' ')}`,
    );
    log.addLine('-'.repeat(60));

    for (const month of report.months ?? []) {
        log.addLine(monthLine(month));
    }

    if (report.taxpayers && report.taxpayers.length > 0) {
        log.addLine('');
        log.addLine(`Mükellefler (${formatNumber(report.taxpayers.length)}) — harcanan alana göre`);
        log.addLine('-'.repeat(60));

        for (const taxpayer of report.taxpayers) {
            log.addLine(`${(taxpayer.vknTckn ?? '').padEnd(12, ' ')} ${taxpayer.title ?? ''}`);
            log.addLine(
                `             yükleme: ${formatNumber(taxpayer.uploadCount)} | harcanan: ${formatMb(taxpayer.usedAreaMb)}` +
                    ` | tanımlı alan: ${formatMb(taxpayer.areaMb)}`,
            );
        }
    }

    log.addLine('');
    log.addLine('Not: alan birimi portalın bildirdiği değerdir (MB varsayıldı); defter türü kırılımı bayi servisinde yok.');
    log.addLine(`Süre : ${formatNumber(Math.round((report.elapsedMs ?? 0) / 100) / 10)} sn`);
}
