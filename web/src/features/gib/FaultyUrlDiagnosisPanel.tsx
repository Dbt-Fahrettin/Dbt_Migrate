import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { describeGibFailure } from '../../api/gibClient';
import { getFaultyUrlHosts } from '../../api/gibFaultyUrl';
import type { FaultyUrlHostDiagnosis } from '../../api/gibFaultyUrl';
import { gibEndpoints } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { formatDate, formatDateTime } from '../../format';
import { Field, Label, inputClass } from '../console/formControls';
import {
    MAX_HOST_CONCURRENCY,
    MAX_SAMPLE_COUNT,
    MIN_SAMPLE_COUNT,
    VERDICT_ACTIONS,
    buildMarkdownReport,
    buildSamplesCsv,
    describeChange,
    downloadText,
    exampleDetail,
    fileStamp,
    recordCount,
    selectHosts,
    summarizeByVerdict,
} from './faultyUrlReport';
import type { DiagnosisHostRow } from './faultyUrlReport';
import { useFaultyUrlRun } from './useFaultyUrlRun';

/**
 * XML'i alınamayan belge adreslerinin domain teşhisi — `GibInvoiceQuery/FaultyUrlHosts` +
 * `DiagnoseFaultyUrlHost`.
 *
 * Belli aralıklarla koşulup rapor indirilmek için: her domainden örnek adresler gib-hw'den ve k8s'ten
 * denenir, domain başına neden ve önerilen adım çıkar. Veri yazmaz; yalnız entegratör sunucularına
 * okuma isteği atar.
 */
export function FaultyUrlDiagnosisPanel() {
    const { environment, user } = useAuth();

    const token = user?.lat ?? '';
    const run = useFaultyUrlRun(environment.gibApiBaseUrl, token, environment.key);

    const [sampleCount, setSampleCount] = useState(String(MIN_SAMPLE_COUNT));
    const [minRecords, setMinRecords] = useState('1');
    const [hostLimit, setHostLimit] = useState('0');
    const [concurrency, setConcurrency] = useState('2');
    const [formError, setFormError] = useState('');

    const isRunning = run.state === 'running';

    const hostsQuery = useQuery({
        queryKey: ['gib-faulty-url-hosts', environment.key],
        enabled: false,
        queryFn: async ({ signal }) => {
            const result = await getFaultyUrlHosts(environment.gibApiBaseUrl, token, signal);

            if (!result.isSuccess || !result.data) {
                throw new Error(describeGibFailure(result));
            }

            return result.data;
        },
    });

    const allHosts = useMemo(() => hostsQuery.data ?? [], [hostsQuery.data]);
    const selected = useMemo(
        () => selectHosts(allHosts, toInt(minRecords, 1), toInt(hostLimit, 0)),
        [allHosts, minRecords, hostLimit],
    );

    const selectedRecords = selected.reduce((sum, host) => sum + recordCount(host), 0);
    const totalRecords = allHosts.reduce((sum, host) => sum + recordCount(host), 0);

    // Domain başına ~30-70 sn (örnekler 4'erli, deneme başına en çok 20 sn).
    const estimateMinutes = Math.ceil((selected.length * 45) / 60 / Math.max(1, toInt(concurrency, 2)));

    function handleRun() {
        const samples = toInt(sampleCount, 0);
        const workers = toInt(concurrency, 0);

        if (samples < MIN_SAMPLE_COUNT || samples > MAX_SAMPLE_COUNT) {
            setFormError(`Örnek sayısı ${MIN_SAMPLE_COUNT}-${MAX_SAMPLE_COUNT} arasında olmalı.`);

            return;
        }

        if (workers < 1 || workers > MAX_HOST_CONCURRENCY) {
            setFormError(`Paralel domain 1-${MAX_HOST_CONCURRENCY} arasında olmalı.`);

            return;
        }

        if (selected.length === 0) {
            setFormError('Seçilen domain yok. Önce domain listesini getirin.');

            return;
        }

        setFormError('');
        run.start(selected, samples, workers);
    }

    function downloadReport() {
        if (!run.run) {
            return;
        }

        const stamp = fileStamp(run.run.finishedAt || new Date().toISOString());

        downloadText(
            `gib-faulty-domain-rapor-${environment.key}-${stamp}.md`,
            buildMarkdownReport(run.run, run.previous),
            'text/markdown;charset=utf-8',
        );
    }

    function downloadSamples() {
        if (!run.run) {
            return;
        }

        const stamp = fileStamp(run.run.finishedAt || new Date().toISOString());

        downloadText(
            `gib-faulty-domain-ornekler-${environment.key}-${stamp}.csv`,
            buildSamplesCsv(run.run),
            'text/csv;charset=utf-8',
        );
    }

    const rows = run.run?.rows ?? [];
    const error = formError || run.error || (hostsQuery.error?.message ?? '');

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Alınamayan XML — Domain Teşhisi</h2>
            <p className="mt-1 font-mono text-[11px] break-all text-slate-500 dark:text-slate-400">
                {gibEndpoints.diagnoseFaultyUrlHost(environment.gibApiBaseUrl, '…', toInt(sampleCount, 10))}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Raporlanmamış faulty kayıtlarının belge adreslerini domain bazında dener: her domainden örnek adresler{' '}
                <strong>gib-hw</strong> (101.44.33.54) ve <strong>k8s</strong> (213.250.144.198) üzerinden istenir, iki
                yolun sonucu karşılaştırılarak XML'in neden alınamadığı çıkarılır. <strong>Veri yazmaz.</strong> Koşu
                tamamlanınca kararlar bu tarayıcıda saklanır; sonraki raporda değişen domainler işaretlenir.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                    type="button"
                    onClick={() => void hostsQuery.refetch()}
                    disabled={isRunning || hostsQuery.isFetching}
                    className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                    {hostsQuery.isFetching ? 'Getiriliyor…' : 'Domain listesini getir'}
                </button>
                {hostsQuery.data && (
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                        {allHosts.length} domain, {totalRecords.toLocaleString('tr-TR')} kayıt ·{' '}
                        <strong>seçilen {selected.length}</strong> domain ({selectedRecords.toLocaleString('tr-TR')}{' '}
                        kayıt), tahmini ~{estimateMinutes} dk
                    </span>
                )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberField
                    id="faultySamples"
                    label={`Örnek / domain (${MIN_SAMPLE_COUNT}-${MAX_SAMPLE_COUNT})`}
                    value={sampleCount}
                    disabled={isRunning}
                    onChange={setSampleCount}
                />
                <NumberField
                    id="faultyMinRecords"
                    label="En az kayıt"
                    value={minRecords}
                    disabled={isRunning}
                    onChange={setMinRecords}
                />
                <NumberField
                    id="faultyHostLimit"
                    label="En çok domain (0 = hepsi)"
                    value={hostLimit}
                    disabled={isRunning}
                    onChange={setHostLimit}
                />
                <NumberField
                    id="faultyConcurrency"
                    label={`Paralel domain (1-${MAX_HOST_CONCURRENCY})`}
                    value={concurrency}
                    disabled={isRunning}
                    onChange={setConcurrency}
                />
            </div>

            {run.previous && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Karşılaştırılacak önceki tam koşu: {formatDateTime(run.previous.finishedAt)} (
                    {Object.keys(run.previous.verdicts).length} domain)
                </p>
            )}

            {error && (
                <p
                    role="alert"
                    className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                >
                    {error}
                </p>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                    type="button"
                    onClick={handleRun}
                    disabled={isRunning || selected.length === 0}
                    className="flex-1 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
                >
                    {isRunning ? 'Teşhis ediliyor…' : 'Teşhisi başlat'}
                </button>
                <button
                    type="button"
                    onClick={run.stop}
                    disabled={!isRunning}
                    title="Koşan domainler biter; yeni domain başlatılmaz."
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Durdur
                </button>
                <button
                    type="button"
                    onClick={downloadReport}
                    disabled={rows.length === 0}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Rapor (.md)
                </button>
                <button
                    type="button"
                    onClick={downloadSamples}
                    disabled={rows.length === 0}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Örnekler (.csv)
                </button>
                {run.run && !isRunning && (
                    <button
                        type="button"
                        onClick={run.reset}
                        className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        Temizle
                    </button>
                )}
            </div>

            {run.run && <RunResult run={run} rows={rows} />}
        </section>
    );
}

const STATE_LABEL: Record<string, { text: string; tone: string }> = {
    running: { text: 'Çalışıyor', tone: 'bg-sky-500 animate-pulse' },
    done: { text: 'Tamamlandı', tone: 'bg-emerald-500' },
    stopped: { text: 'Durduruldu', tone: 'bg-amber-500' },
    failed: { text: 'Hatalı bitti', tone: 'bg-red-500' },
    idle: { text: 'Hazır', tone: 'bg-slate-400' },
};

/** Aksiyon gerektiren kararlar yeşil, uç hatası kırmızı, gerisi nötr. */
function verdictTone(verdict: string): string {
    if (verdict === 'IpRestricted' || verdict === 'FetchableNow') {
        return 'text-emerald-700 dark:text-emerald-300';
    }

    if (verdict === 'CallFailed') {
        return 'text-red-600 dark:text-red-400';
    }

    return 'text-slate-700 dark:text-slate-200';
}

function RunResult({ run, rows }: { run: ReturnType<typeof useFaultyUrlRun>; rows: DiagnosisHostRow[] }) {
    const planned = run.run?.plannedHostCount ?? 0;
    const percent = planned > 0 ? Math.min(100, Math.round((rows.length / planned) * 100)) : 0;
    const status = STATE_LABEL[run.state] ?? STATE_LABEL.idle;
    const groups = summarizeByVerdict(rows);
    const sorted = [...rows].sort((a, b) => recordCount(b.summary) - recordCount(a.summary));

    return (
        <div className="mt-5 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.tone}`} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{status.text}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                    · {rows.length}/{planned} domain (%{percent})
                </span>
            </div>

            <div
                className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${percent}%` }} />
            </div>

            {groups.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                            <tr>
                                <th className="px-3 py-2 font-semibold">Karar</th>
                                <th className="px-3 py-2 text-right font-semibold">Domain</th>
                                <th className="px-3 py-2 text-right font-semibold">Kayıt</th>
                                <th className="px-3 py-2 font-semibold">Öneri</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {groups.map((group) => (
                                <tr key={group.verdict}>
                                    <td className={`px-3 py-1.5 font-medium ${verdictTone(group.verdict)}`}>
                                        {group.verdictText}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{group.domains}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {group.records.toLocaleString('tr-TR')}
                                    </td>
                                    <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">
                                        {VERDICT_ACTIONS[group.verdict] ?? ''}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {sorted.length > 0 && (
                <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {sorted.map((row) => (
                        <HostRow key={row.summary.host} row={row} change={describeChange(row, run.previous)} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function HostRow({ row, change }: { row: DiagnosisHostRow; change: string }) {
    const d = row.diagnosis;
    const s = row.summary;

    return (
        <li className="px-3 py-2 text-xs">
            <details>
                <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{s.host}</span>
                        <span className="text-slate-500 dark:text-slate-400">
                            {s.pendingCount.toLocaleString('tr-TR')} açık
                            {s.abandonedCount > 0 && ` + ${s.abandonedCount.toLocaleString('tr-TR')} bırakılmış`} ·{' '}
                            {s.packCount} paket · son {formatDate(s.lastDate) || '-'}
                        </span>
                        {change && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                {change}
                            </span>
                        )}
                    </div>
                    <div className={`mt-0.5 font-medium ${verdictTone(d?.verdict ?? 'CallFailed')}`}>
                        {d ? d.verdictText : `Teşhis ucu yanıt vermedi: ${row.error}`}
                        {d && (
                            <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                                gib-hw {d.hwOkCount}/{d.triedCount} · k8s {d.directOkCount}/{d.triedCount} ·{' '}
                                {d.elapsedSeconds.toFixed(0)} sn
                            </span>
                        )}
                    </div>
                    {d && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{exampleDetail(d)}</p>}
                </summary>
                {d && <SampleList diagnosis={d} />}
            </details>
        </li>
    );
}

function SampleList({ diagnosis }: { diagnosis: FaultyUrlHostDiagnosis }) {
    return (
        <ul className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
            {diagnosis.samples.map((sample, index) => (
                <li key={`${sample.url}-${index}`} className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    <div className="break-all">{sample.url}</div>
                    <div className="text-slate-500 dark:text-slate-400">
                        {formatDate(sample.invoiceDate)} · {sample.docType}
                        {sample.isAbandoned ? ' · bırakılmış' : ''} · <strong>{sample.reasonText}</strong>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                        gib-hw: {sample.hw.isOk ? 'alındı' : sample.hw.detail || 'alınamadı'} · k8s:{' '}
                        {sample.direct.isOk
                            ? 'alındı'
                            : `${sample.direct.statusCode > 0 ? `HTTP ${sample.direct.statusCode} ` : ''}${sample.direct.kind ?? ''} ${sample.direct.detail ?? ''}`}
                    </div>
                </li>
            ))}
        </ul>
    );
}

function NumberField({
    id,
    label,
    value,
    disabled,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <Field>
            <Label htmlFor={id}>{label}</Label>
            <input
                id={id}
                inputMode="numeric"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className={`${inputClass} font-mono`}
            />
        </Field>
    );
}

function toInt(value: string, fallback: number): number {
    const parsed = Number.parseInt(value.trim(), 10);

    return Number.isFinite(parsed) ? parsed : fallback;
}
