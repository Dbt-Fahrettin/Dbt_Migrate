import { endpoints } from '../api/endpoints';
import { getJson, postJson } from '../api/http';
import type { OperationLog } from './operationLog';
import { describePortalFailure } from './portalReports';
import { emptyCounters } from './types';

/**
 * Mükellef bazında portal kullanımı — Service.Api tarama işleri mükelleflerin kendi portal kimlikleriyle tarar ve
 * sonucu Login veritabanındaki `login.etr_usage_stats` tablosuna yazar; bu dosya o işleri başlatır/izler ve tabloyu
 * rapor olarak okur. Uçlar `UndPortal` altında: Login.Api giriş belirteci + `UndPortal:AllowedUsers`.
 */

/** Login tablosundaki tür kodları (Devatek.Models.EtrUsageDocTypeEnum). */
export const USAGE_DOC_TYPES: Record<number, string> = {
    1: 'Gelen e-Fatura',
    2: 'Giden e-Fatura',
    3: 'e-Arşiv',
    4: 'Gelen e-İrsaliye',
    5: 'Giden e-İrsaliye',
    6: 'Gelen e-İrsaliye Yanıtı',
    7: 'Giden e-İrsaliye Yanıtı',
    8: 'e-SMM',
    9: 'e-MM',
    20: 'e-Defter',
};

export const DOC_TYPE_EBOOK = 20;

export interface PortalUsageRow {
    vknTckn: string;
    vkn?: string | null;
    tckn?: string | null;
    title?: string | null;
    docType: number;
    year: number;
    month: number;
    docCount: number;
    sizeMb?: number | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    status?: string | null;
    error?: string | null;
    scannedAt?: string | null;
}

export interface PortalScanProgress {
    isDone: boolean;
    phase?: string | null;
    range?: string | null;
    taxpayerCount: number;
    processedCount: number;
    failedCount: number;
    rowsWritten: number;
    elapsed?: string | null;
    message?: string | null;
    failures?: string[] | null;
}

export interface PortalScanJobStatus {
    jobId: string;
    isFound: boolean;
    state?: string | null;
    isFinished: boolean;
    progress?: PortalScanProgress | null;
}

export interface PortalUsageRequest {
    apiBaseUrl: string;
    log: OperationLog;
    operationName: string;
    token: string;
    /** ISO (yyyy-MM-dd); yalnız yıl-ay kısmı kullanılır. */
    docStartDate: string;
    docEndDate: string;
    /** Virgül/boşlukla ayrılmış VKN/TCKN listesi; boşsa hepsi. */
    vknText: string;
    withTaxpayers: boolean;
    signal: AbortSignal;
    /** Testlerde kısaltılır. */
    pollIntervalMs?: number;
    /** Testlerde dosya indirmeyi yakalamak için. */
    download?: (fileName: string, content: string) => void;
}

const POLL_INTERVAL_MS = 5000;

/** Durum sorgusu bu kadar üst üste düşerse izleme bırakılır (iş sunucuda sürer). */
const MAX_POLL_FAILURES = 6;

const numberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

function formatNumber(value: number | null | undefined): string {
    return numberFormat.format(value ?? 0);
}

function authHeaders(token: string): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/** yyyy-MM-dd → yyyy-MM. */
export function toMonth(isoDate: string): string {
    return isoDate.slice(0, 7);
}

export function parseVknList(text: string): string[] {
    return [...new Set(text.split(/[\s,;]+/).map((v) => v.trim()).filter((v) => v.length > 0))];
}

/** 10 ya da 11 haneli olmayan girdiler; doğrulama mesajı için. */
export function invalidVkns(text: string): string[] {
    return parseVknList(text).filter((v) => !/^\d{10,11}$/.test(v));
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);

        signal.addEventListener(
            'abort',
            () => {
                clearTimeout(timer);
                resolve();
            },
            { once: true },
        );
    });
}

function progressLine(progress: PortalScanProgress | null | undefined, state: string | null | undefined): string {
    if (!progress) {
        return `Durum : ${state ?? '?'} — iş henüz başlamadı`;
    }

    return (
        `Durum : ${progress.phase ?? state ?? '?'} — ${formatNumber(progress.processedCount)}/${formatNumber(progress.taxpayerCount)} mükellef, ` +
        `hata ${formatNumber(progress.failedCount)}, yazılan ${formatNumber(progress.rowsWritten)} satır` +
        (progress.elapsed ? `, süre ${progress.elapsed}` : '')
    );
}

/** Mükellef bazında tarama türleri: Service.Api'de ayrı Hangfire işleri, aynı ilerleme yapısı. */
export type PortalScanKind = 'ebook' | 'ebelge' | 'rest';

const SCAN_LABELS: Record<PortalScanKind, { title: string; credentials: string }> = {
    ebook: { title: 'E-Defter Boyut Taraması', credentials: 'e-Defter kimlikleri' },
    ebelge: { title: 'E-Belge Adet Taraması', credentials: 'e-belge web servis kullanıcıları' },
    rest: { title: 'Portal E-Belge Taraması (bayi)', credentials: 'bayinin portaldaki aktif müşterileri' },
};

/**
 * 11-E-Defter Boyutlarını Güncelle — Service.Api'de tarama işini başlatır ve bitene kadar izler. "Durdur" yalnız
 * izlemeyi bırakır; sunucudaki iş sürer, aynı aralık yeniden çalıştırılırsa satırlar üzerine yazılır.
 */
export function runEBookScan(request: PortalUsageRequest): Promise<void> {
    return runPortalScan('ebook', request);
}

/**
 * 14-Portal E-Belge Sayıları (bayi) — bayi hesabıyla portal REST API'sinden bütün aktif müşteriler (Login'de olmayanlar
 * dahil); müşteri adına geçişle ay/tür adetleri. Sonuç 13 ile aynı tabloya yazılır, 12 ile raporlanır.
 */
export function runPortalRestScan(request: PortalUsageRequest): Promise<void> {
    return runPortalScan('rest', request);
}

/** 13-E-Belge Sayılarını Güncelle — her ay ve belge türü için adet; izleme 11 ile aynı. */
export function runEBelgeScan(request: PortalUsageRequest): Promise<void> {
    return runPortalScan('ebelge', request);
}

async function runPortalScan(kind: PortalScanKind, request: PortalUsageRequest): Promise<void> {
    const { apiBaseUrl, log, operationName, signal } = request;
    const startMonth = toMonth(request.docStartDate);
    const endMonth = toMonth(request.docEndDate);
    const vkns = parseVknList(request.vknText);
    const counters = emptyCounters();
    const labels = SCAN_LABELS[kind];

    const url =
        kind === 'ebook'
            ? endpoints.undPortalEBookScan(apiBaseUrl, startMonth, endMonth)
            : kind === 'ebelge'
              ? endpoints.undPortalEBelgeScan(apiBaseUrl, startMonth, endMonth)
              : endpoints.undPortalRestScan(apiBaseUrl, startMonth, endMonth);

    log.setOperation(`${labels.title} - ${url}`);
    log.setStatus(`${operationName} - Başladı`, 'running');
    log.addLine(`Dönem    : ${startMonth} → ${endMonth} (ayın 1'i → son ayın son günü)`);
    log.addLine(`Mükellef : ${vkns.length > 0 ? vkns.join(', ') : `tümü (Login'deki ${labels.credentials})`}`);
    log.flushNow();

    const started = await postJson<PortalScanJobStatus>(url, vkns, signal, authHeaders(request.token));

    if (!started.isSuccess || !started.data?.jobId) {
        counters.error += 1;
        log.addLine('Tarama başlatılamadı');
        log.addError(started.isSuccess ? 'Sunucu iş numarası döndürmedi.' : describePortalFailure(started));
        finish(log, operationName, counters);

        return;
    }

    const jobId = started.data.jobId;
    log.addLine(`İş       : ${jobId} kuyruğa alındı`);
    const statusIndex = log.addLine(progressLine(null, 'Enqueued'));
    log.flushNow();

    let status: PortalScanJobStatus | null = null;
    let pollFailures = 0;

    while (!signal.aborted) {
        await delay(request.pollIntervalMs ?? POLL_INTERVAL_MS, signal);

        if (signal.aborted) {
            break;
        }

        const result = await getJson<PortalScanJobStatus>(
            endpoints.undPortalScanStatus(apiBaseUrl, jobId),
            signal,
            authHeaders(request.token),
        );

        if (!result.isSuccess || !result.data) {
            pollFailures += 1;

            if (pollFailures >= MAX_POLL_FAILURES) {
                log.addError(`Durum okunamıyor, izleme bırakıldı (iş sunucuda sürüyor olabilir): ${describePortalFailure(result)}`);
                break;
            }

            continue;
        }

        pollFailures = 0;
        status = result.data;
        log.replaceLine(statusIndex, progressLine(status.progress, status.state));

        if (status.isFinished || status.progress?.isDone) {
            break;
        }
    }

    if (signal.aborted) {
        log.addLine('İzleme durduruldu — iş sunucuda sürüyor; durum için aynı aralığı raporla kontrol edin.');
        counters.skipped += 1;
        finish(log, operationName, counters);

        return;
    }

    const progress = status?.progress;

    if (progress?.message) {
        log.addLine(progress.message);
    }

    for (const failure of progress?.failures ?? []) {
        log.addError(failure);
    }

    if (progress && progress.failedCount > (progress.failures?.length ?? 0)) {
        log.addError(`… ve ${formatNumber(progress.failedCount - (progress.failures?.length ?? 0))} hata daha (yalnız ilk satırlar tutulur).`);
    }

    const isFailed = !status || status.state === 'Failed' || (progress?.message ?? '').startsWith('Tarama yarıda kaldı');

    if (isFailed) {
        counters.error += 1;
    } else {
        counters.success += 1;
    }

    log.addLine('Sonuç için "12-Portal Kullanım Raporu"nu aynı dönemle çalıştırın.');
    finish(log, operationName, counters);
}

function finish(log: OperationLog, operationName: string, counters: ReturnType<typeof emptyCounters>): void {
    counters.queued = counters.success + counters.error + counters.skipped;
    log.setCounters(counters);
    log.setStatus(`${operationName} - Tamamlandı`, counters.error > 0 ? 'failed' : 'succeeded');
    log.flushNow();
}

/**
 * 12-Portal Kullanım Raporu — Login tablosundan ay ay toplamlar (tür başına mükellef, adet, MB) ve isteğe bağlı mükellef
 * listesi; bütün satırlar Excel'in açtığı CSV olarak indirilir.
 */
export async function runUsageReport(request: PortalUsageRequest): Promise<void> {
    const { apiBaseUrl, log, operationName } = request;
    const startMonth = toMonth(request.docStartDate);
    const endMonth = toMonth(request.docEndDate);
    const vkns = parseVknList(request.vknText);
    const counters = emptyCounters();

    const url = endpoints.undPortalUsageReport(apiBaseUrl, startMonth, endMonth, null, vkns);

    log.setOperation(`Portal Kullanım Raporu - ${url}`);
    log.setStatus(`${operationName} - Başladı`, 'running');
    log.addLine(`Dönem : ${startMonth} → ${endMonth}`);
    log.flushNow();

    const result = await getJson<PortalUsageRow[]>(url, request.signal, authHeaders(request.token));

    if (!result.isSuccess || !result.data) {
        counters.error += 1;
        log.addLine('Rapor alınamadı');
        log.addError(describePortalFailure(result));
        finish(log, operationName, counters);

        return;
    }

    const rows = result.data;

    if (rows.length === 0) {
        log.addLine('Bu dönemde satır yok — önce "11-E-Defter Boyutlarını Güncelle" ile tarayın.');
        counters.success += 1;
        finish(log, operationName, counters);

        return;
    }

    writeUsageSummary(log, rows, request.withTaxpayers);
    writePeriodSummary(log, buildPeriodSummary(rows));

    const fileName = `portal-kullanim-${startMonth}_${endMonth}.csv`;
    (request.download ?? downloadText)(fileName, buildUsageCsv(rows));
    log.addLine('');
    log.addLine(`Excel dosyası indirildi: ${fileName} (${formatNumber(rows.length)} satır)`);

    counters.success += 1;
    finish(log, operationName, counters);
}

interface Totals {
    taxpayers: Set<string>;
    docCount: number;
    sizeMb: number;
    errors: number;
}

function emptyTotals(): Totals {
    return { taxpayers: new Set<string>(), docCount: 0, sizeMb: 0, errors: 0 };
}

function add(totals: Totals, row: PortalUsageRow): void {
    totals.taxpayers.add(row.vknTckn);
    totals.docCount += row.docCount ?? 0;
    totals.sizeMb += row.sizeMb ?? 0;
    totals.errors += row.error ? 1 : 0;
}

function monthKey(row: PortalUsageRow): string {
    return `${row.year}-${String(row.month).padStart(2, '0')}`;
}

function docTypeName(docType: number): string {
    return USAGE_DOC_TYPES[docType] ?? `Tür ${docType}`;
}

/**
 * Rapor tabloları sekme ayraçlı yazılır: konsolda (sekme genişliği 20) sütunlar hizalı görünür, "Kopyala" ile alınan
 * çıktı Excel'e yapıştırılınca her değer kendi hücresine düşer.
 */
function cells(...values: string[]): string {
    return values.join('\t');
}

function totalsLine(label: string, totals: Totals, isEBook: boolean): string {
    return cells(
        label,
        formatNumber(totals.taxpayers.size),
        formatNumber(totals.docCount),
        ...(isEBook ? [`${formatNumber(Math.round(totals.sizeMb * 1000) / 1000)} MB`] : []),
        ...(totals.errors > 0 ? [`(${formatNumber(totals.errors)} hatalı satır)`] : []),
    );
}

export function writeUsageSummary(log: OperationLog, rows: PortalUsageRow[], withTaxpayers: boolean): void {
    const docTypes = [...new Set(rows.map((r) => r.docType))].sort((a, b) => a - b);

    for (const docType of docTypes) {
        const isEBook = docType === DOC_TYPE_EBOOK;
        const typeRows = rows.filter((r) => r.docType === docType);
        const byMonth = new Map<string, Totals>();
        const all = emptyTotals();

        for (const row of typeRows) {
            const key = monthKey(row);
            const totals = byMonth.get(key) ?? emptyTotals();

            add(totals, row);
            add(all, row);
            byMonth.set(key, totals);
        }

        log.addLine('');
        log.addLine(`${docTypeName(docType)}`);
        log.addLine(cells('Ay', 'Mükellef', isEBook ? 'Parça' : 'Adet', ...(isEBook ? ['Boyut'] : [])));

        for (const [key, totals] of [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            log.addLine(totalsLine(key, totals, isEBook));
        }

        log.addLine(totalsLine('Toplam', all, isEBook));

        if (withTaxpayers) {
            const byTaxpayer = new Map<string, { title: string; totals: Totals }>();

            for (const row of typeRows) {
                const entry = byTaxpayer.get(row.vknTckn) ?? { title: row.title ?? '', totals: emptyTotals() };

                add(entry.totals, row);
                byTaxpayer.set(row.vknTckn, entry);
            }

            const sorted = [...byTaxpayer.entries()].sort(([, a], [, b]) =>
                isEBook ? b.totals.sizeMb - a.totals.sizeMb : b.totals.docCount - a.totals.docCount,
            );

            log.addLine('');
            log.addLine(`Mükellefler (${formatNumber(sorted.length)}) — ${isEBook ? 'boyuta' : 'adede'} göre`);
            log.addLine(cells('VKN/TCKN', isEBook ? 'Parça' : 'Adet', ...(isEBook ? ['Boyut'] : []), 'Unvan'));

            for (const [vknTckn, entry] of sorted) {
                log.addLine(
                    cells(
                        vknTckn,
                        formatNumber(entry.totals.docCount),
                        ...(isEBook ? [`${formatNumber(entry.totals.sizeMb)} MB`] : []),
                        entry.title,
                    ),
                );
            }
        }
    }
}

/** Dönem özetindeki e-belge aileleri: giden/gelen ayrımı birleştirilir. */
const DOC_FAMILIES: { name: string; docTypes: number[] }[] = [
    { name: 'E-Fatura', docTypes: [1, 2] },
    { name: 'E-Arşiv', docTypes: [3] },
    { name: 'E-İrsaliye', docTypes: [4, 5, 6, 7] },
    { name: 'E-SMM', docTypes: [8] },
    { name: 'E-Müstahsil', docTypes: [9] },
];

export interface PeriodSummary {
    families: { name: string; count: number; percent: number }[];
    totalDocs: number;
    eBookMb: number;
}

/** Dönemin tamamı: aile başına belge adedi ve toplam içindeki oranı (%), e-Defter toplam boyutu. */
export function buildPeriodSummary(rows: PortalUsageRow[]): PeriodSummary {
    const counts = DOC_FAMILIES.map((family) =>
        rows.filter((r) => family.docTypes.includes(r.docType)).reduce((sum, r) => sum + (r.docCount ?? 0), 0),
    );
    const totalDocs = counts.reduce((sum, c) => sum + c, 0);

    return {
        families: DOC_FAMILIES.map((family, i) => ({
            name: family.name,
            count: counts[i],
            percent: totalDocs > 0 ? (counts[i] * 100) / totalDocs : 0,
        })),
        totalDocs,
        eBookMb: rows.filter((r) => r.docType === DOC_TYPE_EBOOK).reduce((sum, r) => sum + (r.sizeMb ?? 0), 0),
    };
}

const percentFormat = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function writePeriodSummary(log: OperationLog, summary: PeriodSummary): void {
    log.addLine('');
    log.addLine('Dönem özeti');
    log.addLine(cells('Belge', 'Adet', 'Oran'));

    for (const family of summary.families) {
        log.addLine(cells(family.name, formatNumber(family.count), `%${percentFormat.format(family.percent)}`));
    }

    log.addLine(cells('Toplam belge', formatNumber(summary.totalDocs), '%100,00'));
    log.addLine('');
    log.addLine(cells('E-Defter', `${percentFormat.format(summary.eBookMb)} MB`, `${percentFormat.format(summary.eBookMb / 1024)} GB`));
}

function csvDecimal(value: number): string {
    return value.toFixed(2).replace('.', ',');
}

/**
 * Excel (tr-TR) için: noktalı virgül ayraç, ondalık virgül, UTF-8 BOM. Satırların altına bir boş satır ve dönem özeti
 * (aile başına adet, oran %, toplam belge, e-Defter MB/GB) eklenir.
 */
export function buildUsageCsv(rows: PortalUsageRow[]): string {
    const header = ['VKN/TCKN', 'VKN', 'TCKN', 'Unvan', 'Tür', 'Yıl', 'Ay', 'Adet', 'MB', 'Dönem Başı', 'Dönem Sonu', 'Durum', 'Tarama', 'Hata'];

    const lines = rows.map((r) =>
        [
            excelText(r.vknTckn),
            excelText(r.vkn),
            excelText(r.tckn),
            r.title ?? '',
            docTypeName(r.docType),
            String(r.year),
            String(r.month),
            String(r.docCount ?? 0),
            r.sizeMb == null ? '' : String(r.sizeMb).replace('.', ','),
            r.periodStart ?? '',
            r.periodEnd ?? '',
            r.status ?? '',
            r.scannedAt ? r.scannedAt.slice(0, 19).replace('T', ' ') : '',
            r.error ?? '',
        ]
            .map(csvCell)
            .join(';'),
    );

    const summary = buildPeriodSummary(rows);
    const summaryLines = [
        '',
        ['Dönem Özeti', ...summary.families.map((f) => f.name), 'Toplam Belge', 'E-Defter MB', 'E-Defter GB'],
        [
            'Adet',
            ...summary.families.map((f) => String(f.count)),
            String(summary.totalDocs),
            csvDecimal(summary.eBookMb),
            csvDecimal(summary.eBookMb / 1024),
        ],
        ['Oran %', ...summary.families.map((f) => csvDecimal(f.percent)), csvDecimal(summary.totalDocs > 0 ? 100 : 0)],
    ].map((line) => (Array.isArray(line) ? line.map(csvCell).join(';') : line));

    return `\uFEFF${[header.map(csvCell).join(';'), ...lines, ...summaryLines].join('\r\n')}\r\n`;
}

/** VKN 0 ile başlayabilir; Excel sayı sanıp sıfırı silmesin diye ="…" metin formülü. */
function excelText(value: string | null | undefined): string {
    return value ? `="${value}"` : '';
}

/** Ayraç, tırnak ya da satır sonu içeren hücre tırnaklanır. */
function csvCell(value: string): string {
    return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadText(fileName: string, content: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
