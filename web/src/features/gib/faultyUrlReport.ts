import { describeGibFailure } from '../../api/gibClient';
import { diagnoseFaultyUrlHost } from '../../api/gibFaultyUrl';
import type { FaultyUrlHostDiagnosis, FaultyUrlHostSummary } from '../../api/gibFaultyUrl';
import type { ApiResult } from '../../api/http';

/**
 * XML'i alınamayan belge adreslerinin domain teşhisi — koşu döngüsü ve rapor. React'ten bağımsız,
 * bu yüzden DOM'suz testleniyor.
 *
 * Sunucu tek çağrıda tek domain teşhis ediyor (Cloudflare 100 sn sınırı); döngü domainleri birkaç
 * paralel işçiyle sırayla çağırıp sonuçları topluyor. Rapor istemcide üretilir: Markdown (domain
 * bazında karar) ve CSV (adres bazında ayrıntı). Belli aralıklarla koşulduğu için son koşunun
 * domain kararları tarayıcıda saklanır, bir sonraki rapor "önceki karar" sütunuyla karşılaştırır.
 */

/** Konsolun izin verdiği en az örnek: tek iki adresle domain kararı verilmesin. */
export const MIN_SAMPLE_COUNT = 10;
export const MAX_SAMPLE_COUNT = 30;
export const MAX_HOST_CONCURRENCY = 3;

/** Bir domain çağrısı taşıma hatasında (ağ, 5xx, Cloudflare 524) bu kadar kez daha denenir. */
export const HOST_RETRY_COUNT = 1;

export type DiagnosisRunState = 'idle' | 'running' | 'done' | 'stopped' | 'failed';

/** Raporun bir satırı: domain özeti ve teşhisi (ya da alınamadıysa hatası). */
export interface DiagnosisHostRow {
    summary: FaultyUrlHostSummary;
    diagnosis: FaultyUrlHostDiagnosis | null;
    error: string;
}

export interface DiagnosisRun {
    environmentKey: string;
    startedAt: string;
    finishedAt: string;
    sampleCount: number;
    /** Seçilen domain sayısı (bitmemiş koşuda satır sayısından büyük olabilir). */
    plannedHostCount: number;
    rows: DiagnosisHostRow[];
}

/** Bir sonraki koşuyla karşılaştırmak için saklanan özet (örnekler saklanmaz). */
export interface DiagnosisSnapshot {
    finishedAt: string;
    verdicts: Record<string, { verdict: string; verdictText: string; records: number }>;
}

export function recordCount(summary: FaultyUrlHostSummary): number {
    return summary.pendingCount + summary.abandonedCount;
}

/** En az `minRecords` kaydı olan domainler, kayıt sayısına göre; `limit` 0 ise hepsi. */
export function selectHosts(
    summaries: FaultyUrlHostSummary[],
    minRecords: number,
    limit: number,
): FaultyUrlHostSummary[] {
    const selected = summaries
        .filter((summary) => recordCount(summary) >= Math.max(1, minRecords))
        .sort((a, b) => recordCount(b) - recordCount(a));

    return limit > 0 ? selected.slice(0, limit) : selected;
}

export type DiagnoseCall = (
    gibApiBaseUrl: string,
    token: string | null | undefined,
    host: string,
    sampleCount: number,
) => Promise<ApiResult<FaultyUrlHostDiagnosis>>;

export interface DiagnosisLoopOptions {
    gibApiBaseUrl: string;
    token: string | null | undefined;
    hosts: FaultyUrlHostSummary[];
    sampleCount: number;
    concurrency: number;
    /** true dönerse yeni domain başlatılmaz; koşan çağrılar biter. */
    shouldStop: () => boolean;
    /** Her domain bittiğinde (başarılı ya da hatalı), bitiş sırasıyla. */
    onRow: (row: DiagnosisHostRow) => void;
    onError: (message: string) => void;
    /** Testlerde uç yerine sahte çağrı. */
    call?: DiagnoseCall;
}

export async function runDiagnosisLoop(options: DiagnosisLoopOptions): Promise<DiagnosisRunState> {
    const { gibApiBaseUrl, token, hosts, sampleCount, shouldStop, onRow, onError } = options;
    const call = options.call ?? diagnoseFaultyUrlHost;
    const concurrency = Math.min(MAX_HOST_CONCURRENCY, Math.max(1, options.concurrency));

    let next = 0;
    let unauthorized = false;

    async function worker(): Promise<void> {
        for (;;) {
            if (unauthorized || shouldStop() || next >= hosts.length) {
                return;
            }

            const summary = hosts[next];
            next += 1;

            let result: ApiResult<FaultyUrlHostDiagnosis> | null = null;

            for (let attempt = 0; attempt <= HOST_RETRY_COUNT; attempt += 1) {
                result = await call(gibApiBaseUrl, token, summary.host, sampleCount);

                // 4xx'te yeniden denemenin anlamı yok: istek ya da yetki hatalı.
                if (result.isSuccess || (result.status >= 400 && result.status < 500)) {
                    break;
                }
            }

            if (result && result.isSuccess && result.data) {
                onRow({ summary, diagnosis: result.data, error: '' });

                continue;
            }

            const message = result ? describeGibFailure(result) : 'Yanıt alınamadı.';

            // Belirteç kendiliğinden tazelenmiyor: kalan domainleri denemek aynı hatayı üretir.
            if (result?.status === 401) {
                unauthorized = true;
                onError(message);
            }

            onRow({ summary, diagnosis: null, error: message });
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    if (unauthorized) {
        return 'failed';
    }

    return next < hosts.length ? 'stopped' : 'done';
}

/**
 * Karar başına önerilen adım. Sunucudaki neden kodlarıyla (FaultyUrlReason) aynı anahtarlar; bilinmeyen kod
 * için öneri boş kalır.
 */
export const VERDICT_ACTIONS: Record<string, string> = {
    IpRestricted:
        'Host GibDocumentRoutes:ViaHw listesinde değilse ekleyin; bekleyenleri RetryFaultyInvoicesByHost ile kurtarın.',
    FetchableNow: 'Şu an alınıyor: RetryFaultyInvoicesByHost ile bekleyenleri kurtarın.',
    DirectOnly: 'gib-hw bu entegratöre erişemiyor; gece sorgusu doğrudan yolla alabilir, izleyin.',
    AccessDenied: 'Entegratörden 101.44.33.54 (gib-hw) ve 213.250.144.198 (k8s) için IP izni isteyin.',
    Throttled: 'k8s soğumada; entegratörden IP izni isteyin, soğuma bitince yeniden teşhis edin.',
    NotFound: "Belge adresinin süresi geçmiş olabilir; faulty kaydı GİB'e raporlanmalı.",
    Dns: "Alan adı yok: entegratöre bildirin; kayıtlar GİB'e raporlanmalı.",
    Tls: 'TLS uyumsuzluğu: DocumentUrlFetcher yönetilen TLS yolunu da denedi; entegratöre bildirin.',
    Timeout: 'Sunucu yanıt vermiyor: tek seferlik kesinti olabilir, sonraki koşuda tekrar bakın.',
    Connection: 'Bağlantı kurulamıyor: sunucu kapalı ya da IP engelli; sonraki koşuda tekrar bakın.',
    ServerError: 'Entegratör sunucusu 5xx dönüyor: sonraki koşuda tekrar bakın, sürerse bildirin.',
    HtmlPage: 'Belge yerine giriş/hata sayfası dönüyor: adres biçimi ya da oturum gerekiyor, örnek adrese bakın.',
    JsonError: 'JSON hata yanıtı: örnek adresteki mesajı okuyun.',
    EmptyBody: 'Boş gövde: sonraki koşuda tekrar bakın.',
    InvalidUrl: "Adres geçersiz ya da iç ağa işaret ediyor: kayıt GİB'e raporlanmalı.",
    RelayLimited: 'gib-hw hız sınırına takıldı: paralel domain sayısını düşürüp yeniden deneyin.',
    NotTried: 'Uç süre bütçesi doldu: örnek sayısını düşürüp bu domaini yeniden deneyin.',
    CallFailed: 'Teşhis ucu yanıt vermedi: bu domaini yeniden deneyin.',
};

/** Domain kararına göre özet: kaç domain, kaç kayıt. Kayıt sayısına göre azalan. */
export function summarizeByVerdict(
    rows: DiagnosisHostRow[],
): { verdict: string; verdictText: string; domains: number; records: number }[] {
    const map = new Map<string, { verdict: string; verdictText: string; domains: number; records: number }>();

    for (const row of rows) {
        const verdict = row.diagnosis?.verdict ?? 'CallFailed';
        const verdictText = row.diagnosis?.verdictText ?? 'Teşhis ucu yanıt vermedi';
        const entry = map.get(verdict) ?? { verdict, verdictText, domains: 0, records: 0 };

        entry.domains += 1;
        entry.records += recordCount(row.summary);
        map.set(verdict, entry);
    }

    return [...map.values()].sort((a, b) => b.records - a.records || b.domains - a.domains);
}

export function toSnapshot(run: DiagnosisRun): DiagnosisSnapshot {
    const verdicts: DiagnosisSnapshot['verdicts'] = {};

    for (const row of run.rows) {
        if (row.diagnosis) {
            verdicts[row.summary.host] = {
                verdict: row.diagnosis.verdict,
                verdictText: row.diagnosis.verdictText,
                records: recordCount(row.summary),
            };
        }
    }

    return { finishedAt: run.finishedAt, verdicts };
}

/**
 * Önceki koşuya göre değişim: aynıysa boş, önceki koşuda yoksa "yeni", farklıysa önceki kararın metni.
 * Önceki koşu hiç yoksa her zaman boş.
 */
export function describeChange(row: DiagnosisHostRow, previous: DiagnosisSnapshot | null): string {
    if (!previous || !row.diagnosis) {
        return '';
    }

    const before = previous.verdicts[row.summary.host];

    if (!before) {
        return 'yeni';
    }

    return before.verdict === row.diagnosis.verdict ? '' : `önce: ${before.verdictText}`;
}

const SNAPSHOT_KEY_PREFIX = 'gib-faulty-url-diagnosis:';

/** Tarayıcı deposu yoksa ya da bozuksa null (gizli pencere, temizlenmiş site verisi). */
export function loadSnapshot(environmentKey: string): DiagnosisSnapshot | null {
    try {
        const text = localStorage.getItem(SNAPSHOT_KEY_PREFIX + environmentKey);

        if (!text) {
            return null;
        }

        const parsed = JSON.parse(text) as DiagnosisSnapshot;

        return parsed && typeof parsed.verdicts === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

export function saveSnapshot(environmentKey: string, snapshot: DiagnosisSnapshot): void {
    try {
        localStorage.setItem(SNAPSHOT_KEY_PREFIX + environmentKey, JSON.stringify(snapshot));
    } catch {
        // Depo kapalıysa karşılaştırma yalnızca yapılmaz.
    }
}

function formatStamp(iso: string): string {
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
        return iso;
    }

    const pad = (n: number) => String(n).padStart(2, '0');

    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateOnly(value: string | null | undefined): string {
    return value ? value.slice(0, 10) : '';
}

function mdCell(value: string): string {
    return value.replace(/\|/g, '/').replace(/\r?\n/g, ' ');
}

/** Domain örneklerinden en açıklayıcı ayrıntı: kararla aynı nedenli ilk örneğin k8s/gib-hw notu. */
export function exampleDetail(diagnosis: FaultyUrlHostDiagnosis): string {
    const sample = diagnosis.samples.find((s) => s.reason === diagnosis.verdict) ?? diagnosis.samples[0];

    if (!sample) {
        return '';
    }

    const direct = sample.direct;
    const status = direct.statusCode > 0 ? `HTTP ${direct.statusCode}` : 'yanıt yok';
    const parts = [`k8s ${status}${direct.kind ? ` ${direct.kind}` : ''}`];

    if (direct.detail) {
        parts.push(direct.detail);
    }

    if (sample.hw.detail && sample.hw.detail !== direct.detail) {
        parts.push(`gib-hw: ${sample.hw.detail}`);
    }

    return parts.join(' · ').slice(0, 220);
}

export function buildMarkdownReport(run: DiagnosisRun, previous: DiagnosisSnapshot | null): string {
    const rows = [...run.rows].sort((a, b) => recordCount(b.summary) - recordCount(a.summary));
    const sampleTotal = rows.reduce((sum, row) => sum + (row.diagnosis?.triedCount ?? 0), 0);
    const vantage = rows.find((row) => row.diagnosis)?.diagnosis?.directVantage ?? '';
    const lines: string[] = [];

    lines.push(`# XML'i alınamayan belge adresleri — domain teşhisi (${formatStamp(run.finishedAt || run.startedAt)})`);
    lines.push('');
    lines.push(
        `Ortam: ${run.environmentKey} · ${rows.length}/${run.plannedHostCount} domain · ${sampleTotal} örnek adres ` +
            `(domain başına en çok ${run.sampleCount}). Her adres gib-hw aracısından ve k8s'ten` +
            `${vantage ? ` (${vantage})` : ''} doğrudan denendi; veri yazılmadı.`,
    );

    if (previous) {
        lines.push(`Karşılaştırma: ${formatStamp(previous.finishedAt)} koşusu.`);
    }

    lines.push('');
    lines.push('## Karara göre');
    lines.push('');
    lines.push('| Neden | Domain | Bekleyen kayıt | Öneri |');
    lines.push('|---|---:|---:|---|');

    for (const group of summarizeByVerdict(rows)) {
        lines.push(
            `| ${mdCell(group.verdictText)} | ${group.domains} | ${group.records} | ${mdCell(VERDICT_ACTIONS[group.verdict] ?? '')} |`,
        );
    }

    lines.push('');
    lines.push('## Domain bazında');
    lines.push('');
    lines.push(
        '| Domain | Açık | Bırakılmış | Paket | Son tarih | Karar | Örnek dağılımı | gib-hw | k8s | Değişim | Ayrıntı |',
    );
    lines.push('|---|---:|---:|---:|---|---|---|---:|---:|---|---|');

    for (const row of rows) {
        const s = row.summary;
        const d = row.diagnosis;

        if (!d) {
            lines.push(
                `| ${s.host} | ${s.pendingCount} | ${s.abandonedCount} | ${s.packCount} | ${dateOnly(s.lastDate)} | ` +
                    `Teşhis ucu yanıt vermedi | | | | | ${mdCell(row.error)} |`,
            );

            continue;
        }

        const distribution = Object.entries(d.reasonCounts)
            .map(([reason, count]) => `${reason} ${count}`)
            .join(', ');

        lines.push(
            `| ${s.host} | ${s.pendingCount} | ${s.abandonedCount} | ${s.packCount} | ${dateOnly(s.lastDate)} | ` +
                `${mdCell(d.verdictText)} | ${distribution} | ${d.hwOkCount}/${d.triedCount} | ` +
                `${d.directOkCount}/${d.triedCount} | ${mdCell(describeChange(row, previous))} | ${mdCell(exampleDetail(d))} |`,
        );
    }

    lines.push('');

    return lines.join('\n');
}

/** Ayraç, tırnak ya da satır sonu içeren hücre tırnaklanır. */
function csvCell(value: string): string {
    return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Adres bazında ayrıntı; Excel Türkçe ayarıyla açılsın diye `;` ayraçlı ve BOM'lu. */
export function buildSamplesCsv(run: DiagnosisRun): string {
    const header = [
        'Domain',
        'Karar',
        'Adres',
        'Fatura tarihi',
        'Tür',
        'Paket',
        'Başarısız gece',
        'Bırakılmış',
        'Neden',
        'gib-hw alındı',
        'gib-hw ayrıntı',
        'k8s alındı',
        'k8s HTTP',
        'k8s gövde',
        'k8s ayrıntı',
        'k8s ms',
    ];

    const lines = [header.map(csvCell).join(';')];

    for (const row of run.rows) {
        if (!row.diagnosis) {
            lines.push([row.summary.host, 'Teşhis ucu yanıt vermedi', '', '', '', '', '', '', row.error].map(csvCell).join(';'));

            continue;
        }

        for (const sample of row.diagnosis.samples) {
            lines.push(
                [
                    row.summary.host,
                    row.diagnosis.verdictText,
                    sample.url,
                    dateOnly(sample.invoiceDate),
                    sample.docType,
                    sample.packNo == null ? '' : String(sample.packNo),
                    String(sample.failedNightCount),
                    sample.isAbandoned ? 'evet' : '',
                    sample.reasonText,
                    sample.hw.isOk ? 'evet' : 'hayır',
                    sample.hw.detail ?? '',
                    sample.direct.isOk ? 'evet' : 'hayır',
                    sample.direct.statusCode > 0 ? String(sample.direct.statusCode) : '',
                    sample.direct.kind ?? '',
                    sample.direct.detail ?? '',
                    String(sample.direct.elapsedMs),
                ]
                    .map(csvCell)
                    .join(';'),
            );
        }
    }

    return `﻿${lines.join('\r\n')}\r\n`;
}

/** `2026-10-09T20:08:00.000Z` → `20261009_2308` (yerel saat); dosya adları için. */
export function fileStamp(iso: string): string {
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function downloadText(fileName: string, content: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
