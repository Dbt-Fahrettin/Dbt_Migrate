import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeGibFailure } from '../../api/gibClient';
import { getPurgeJob, startPurgeJob, stopPurgeJob } from '../../api/gibPurge';
import type { XmlPurgeJobState, XmlPurgeStartRequest } from '../../api/gibPurge';
import { gibEndpoints } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { formatDateTime } from '../../format';
import { ConfirmDialog } from '../console/ConfirmDialog';
import { Field, Label, inputClass } from '../console/formControls';
import {
    computePurgeRate,
    disabledSwitches,
    formatBytes,
    isPurgeStalled,
    parseBlockedIds,
    toSample,
} from './purgeStats';
import type { PurgeRate, PurgeSample } from './purgeStats';

/**
 * XML kolon boşaltma — `GibXmlStore/purge-job`.
 *
 * Fatura XML'leri nesne deposuna taşındıktan sonra `gib_invoices.xml_content` kolonunda kalan
 * TOAST veriyi boşaltan sunucu tarafı iş. Bu ekran yalnız **durumu okur ve anahtarı çevirir**;
 * boşaltmayı Gib.Api içindeki arka plan servisi yapıyor.
 *
 * Durum 15 sn'de bir kendiliğinden yenilenir; hız iki yoklama arasındaki farktan hesaplanır.
 */

/** Otomatik yenileme aralığı. İş dakikalarca süren partiler hâlinde ilerliyor, sık yoklamaya gerek yok. */
const REFRESH_MS = 15_000;

export function XmlPurgePanel() {
    const { environment, user } = useAuth();
    const queryClient = useQueryClient();

    const token = user?.lat ?? '';
    const queryKey = ['gib-purge-job', environment.key] as const;

    const [pending, setPending] = useState<'start' | 'stop' | null>(null);
    const [notice, setNotice] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [batchSize, setBatchSize] = useState('50');
    const [pauseMs, setPauseMs] = useState('1000');
    const [maxWalBacklogMb, setMaxWalBacklogMb] = useState('2048');
    const [restart, setRestart] = useState(false);

    /** Hız, iki yoklamanın farkından; önceki örnek burada tutulur. */
    const previousSampleRef = useRef<PurgeSample | null>(null);
    const [rate, setRate] = useState<PurgeRate | null>(null);

    const jobQuery = useQuery({
        queryKey,
        refetchInterval: REFRESH_MS,
        queryFn: async ({ signal }) => {
            const result = await getPurgeJob(environment.gibApiBaseUrl, token, signal);

            if (!result.isSuccess || !result.data) {
                throw new Error(describeGibFailure(result));
            }

            const sample = toSample(result.data, Date.now());

            setRate(computePurgeRate(previousSampleRef.current, sample));
            previousSampleRef.current = sample;

            return result.data;
        },
    });

    function applyState(data: XmlPurgeJobState, message: string) {
        queryClient.setQueryData(queryKey, data);
        setNotice(message);
    }

    const startMutation = useMutation({
        mutationFn: async (request: XmlPurgeStartRequest) => {
            const result = await startPurgeJob(environment.gibApiBaseUrl, token, request);

            if (!result.isSuccess || !result.data) {
                throw new Error(describeGibFailure(result));
            }

            return result.data;
        },
        onSuccess: (data) => applyState(data, 'Boşaltma işi açıldı.'),
    });

    const stopMutation = useMutation({
        mutationFn: async () => {
            const result = await stopPurgeJob(environment.gibApiBaseUrl, token);

            if (!result.isSuccess || !result.data) {
                throw new Error(describeGibFailure(result));
            }

            return result.data;
        },
        onSuccess: (data) => applyState(data, 'Boşaltma işi kapatıldı; imleç korundu.'),
    });

    const state = jobQuery.data ?? null;
    const control = state?.control ?? null;
    const isBusy = startMutation.isPending || stopMutation.isPending;

    const error = startMutation.error?.message || stopMutation.error?.message || (jobQuery.error?.message ?? '');

    const blocked = parseBlockedIds(control?.blockedIds);
    const disabled = state ? disabledSwitches(state) : [];
    // "Şimdi" olarak Date.now() değil yoklama anı kullanılıyor: render sırasında Date.now()
    // çağırmak sonucu her render'da oynatır (saf olmayan hesap). dataUpdatedAt zaten doğru
    // referans — "en son baktığımızda son parti ne kadar eskiydi".
    const isStalled =
        control && jobQuery.dataUpdatedAt ? isPurgeStalled(control, jobQuery.dataUpdatedAt) : false;

    function buildStartRequest(): XmlPurgeStartRequest {
        return {
            batchSize: Number.parseInt(batchSize, 10) || undefined,
            pauseMs: Number.parseInt(pauseMs, 10) || undefined,
            maxWalBacklogMb: Number.parseInt(maxWalBacklogMb, 10) || undefined,
            restart,
        };
    }

    function confirmPending() {
        const action = pending;

        setPending(null);
        setNotice('');

        if (action === 'start') {
            startMutation.mutate(buildStartRequest());
        } else if (action === 'stop') {
            stopMutation.mutate();
        }
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">XML Kolon Boşaltma</h2>
            <p className="mt-1 font-mono text-[11px] break-all text-slate-500 dark:text-slate-400">
                {gibEndpoints.purgeJob(environment.gibApiBaseUrl)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Fatura XML'leri nesne deposuna taşındıktan sonra <code>gib_invoices.xml_content</code> kolonunda
                kalan veriyi boşaltır: en yeni satırdan eskiye, küçük partiler hâlinde ve{' '}
                <strong>her satır silinmeden önce depodan indirilip kolonla karşılaştırılarak</strong>. Durum
                veritabanında tutulur; pod yeniden başlasa da kaldığı yerden sürer, iki pod'dan yalnız kiralamayı
                alan koşar. Boşaltma <strong>geri alınamaz</strong>.
            </p>

            {disabled.length > 0 && (
                <Warning>
                    Yapılandırmada kapalı: <span className="font-mono">{disabled.join(', ')}</span>. İş bu hâliyle
                    açılamaz (sunucu 409 döner).
                </Warning>
            )}

            {state?.walBacklogError && <Warning>WAL birikimi okunamadı: {state.walBacklogError}</Warning>}

            {isStalled && (
                <Warning>
                    İş açık görünüyor ama son parti üzerinden 3 dakikadan fazla geçti — WAL birikimi yüzünden
                    bekliyor, kiralamayı alan pod düşmüş ya da sessizce durmuş olabilir. Aşağıdaki durum mesajına
                    bakın.
                </Warning>
            )}

            <StatusPanel state={state} isLoading={jobQuery.isPending} rate={rate} />

            {blocked.length > 0 && <BlockedPanel ids={blocked} />}

            {notice && (
                <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                    {notice}
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

            <button
                type="button"
                onClick={() => setShowAdvanced((d) => !d)}
                className="mt-4 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
            >
                {showAdvanced ? 'Başlatma ayarlarını gizle' : 'Başlatma ayarları'}
            </button>

            {showAdvanced && (
                <div className="mt-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Field>
                            <Label htmlFor="purgeBatchSize">Parti boyutu</Label>
                            <input
                                id="purgeBatchSize"
                                inputMode="numeric"
                                value={batchSize}
                                disabled={isBusy}
                                onChange={(e) => setBatchSize(e.target.value)}
                                className={`${inputClass} font-mono`}
                            />
                        </Field>
                        <Field>
                            <Label htmlFor="purgePauseMs">Partiler arası ms</Label>
                            <input
                                id="purgePauseMs"
                                inputMode="numeric"
                                value={pauseMs}
                                disabled={isBusy}
                                onChange={(e) => setPauseMs(e.target.value)}
                                className={`${inputClass} font-mono`}
                            />
                        </Field>
                        <Field>
                            <Label htmlFor="purgeWal">WAL sınırı MB</Label>
                            <input
                                id="purgeWal"
                                inputMode="numeric"
                                value={maxWalBacklogMb}
                                disabled={isBusy}
                                onChange={(e) => setMaxWalBacklogMb(e.target.value)}
                                className={`${inputClass} font-mono`}
                            />
                        </Field>
                    </div>

                    <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input
                            type="checkbox"
                            checked={restart}
                            disabled={isBusy}
                            onChange={(e) => setRestart(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span>
                            İkinci tur (restart)
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                                İmleci sıfırlar; iş en yeni satırdan yeniden başlar. Karantinası dolmuş satırlar
                                için.
                            </span>
                        </span>
                    </label>
                </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                    type="button"
                    onClick={() => {
                        setNotice('');
                        void jobQuery.refetch();
                    }}
                    disabled={jobQuery.isFetching}
                    className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                    {jobQuery.isFetching ? 'Yenileniyor…' : 'Yenile'}
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setNotice('');
                        setPending('start');
                    }}
                    disabled={isBusy || control?.isEnabled === true || disabled.length > 0}
                    className={[
                        'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-40',
                        environment.requiresConfirmation
                            ? 'bg-red-600 hover:bg-red-500'
                            : 'bg-amber-600 hover:bg-amber-500',
                    ].join(' ')}
                >
                    Boşaltmayı Başlat
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setNotice('');
                        setPending('stop');
                    }}
                    disabled={isBusy || control?.isEnabled === false}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Durdur
                </button>
            </div>

            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                Durum {REFRESH_MS / 1000} saniyede bir kendiliğinden yenilenir. Hız iki yoklama arasındaki farktan
                hesaplanır, bu yüzden ilk okumada görünmez.
            </p>

            {pending === 'start' && (
                <ConfirmDialog
                    title={
                        environment.requiresConfirmation
                            ? 'PROD: geri alınamaz boşaltma başlatılacak'
                            : 'Geri alınamaz boşaltma başlatılacak'
                    }
                    summary={[
                        `Ortam : ${environment.name} — ${environment.gibApiBaseUrl}`,
                        `Parti : ${batchSize} satır · ${pauseMs} ms ara · WAL sınırı ${maxWalBacklogMb} MB`,
                        restart
                            ? 'İKİNCİ TUR: imleç sıfırlanacak, en yeniden başlayacak.'
                            : 'İmleç kaldığı yerden sürecek.',
                        'GERÇEK ve GERİ ALINAMAZ boşaltma başlar: xml_content kolonu kalıcı olarak temizlenir.',
                        'Her satır silinmeden önce nesne deposundan indirilip karşılaştırılır.',
                    ]}
                    requiredText={environment.requiresConfirmation ? 'PROD BOSALT' : 'BOSALT'}
                    onConfirm={confirmPending}
                    onCancel={() => setPending(null)}
                />
            )}

            {pending === 'stop' && (
                <ConfirmDialog
                    title="Boşaltma işi durdurulacak"
                    summary={[
                        `Ortam : ${environment.name}`,
                        'İmleç korunur; yeniden açıldığında kaldığı yerden sürer.',
                        'Koşan parti kendi içinde tamamlanır.',
                    ]}
                    requiredText="DURDUR"
                    onConfirm={confirmPending}
                    onCancel={() => setPending(null)}
                />
            )}
        </section>
    );
}

function Warning({ children }: { children: React.ReactNode }) {
    return (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {children}
        </p>
    );
}

function StatusPanel({
    state,
    isLoading,
    rate,
}: {
    state: XmlPurgeJobState | null;
    isLoading: boolean;
    rate: PurgeRate | null;
}) {
    if (!state) {
        return (
            <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
                {isLoading ? 'Durum sorgulanıyor…' : 'Durum okunamadı.'}
            </p>
        );
    }

    const control = state.control;

    return (
        <div className="mt-4 space-y-3">
            <div
                className={[
                    'rounded-lg px-3 py-2.5',
                    control.isEnabled
                        ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                ].join(' ')}
            >
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={`h-2.5 w-2.5 rounded-full ${
                            control.isEnabled ? 'animate-pulse bg-amber-500' : 'bg-slate-400'
                        }`}
                    />
                    <span className="font-semibold">{control.isEnabled ? 'AÇIK' : 'KAPALI'}</span>
                    {control.leaseOwner && (
                        <span className="font-mono text-xs opacity-80">pod: {control.leaseOwner}</span>
                    )}
                </div>
                {control.statusMessage && <p className="mt-1 text-xs opacity-90">{control.statusMessage}</p>}
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Cell label="Boşaltılan satır" value={control.clearedCount.toLocaleString('tr-TR')} />
                <Cell label="Boşalan" value={formatBytes(control.freedBytes)} tone="emerald" />
                <Cell label="Parti" value={control.batchCount.toLocaleString('tr-TR')} />
                <Cell
                    label="İmleç"
                    value={
                        control.cursorBeforeCounter > 0
                            ? control.cursorBeforeCounter.toLocaleString('tr-TR')
                            : 'en yeniden'
                    }
                />
                <Cell
                    label="Hız"
                    value={rate ? `${rate.rowsPerSecond.toFixed(1)} satır/sn` : '—'}
                    tone={rate ? 'sky' : undefined}
                />
                <Cell label="Hacim" value={rate ? `${rate.gbPerHour.toFixed(1)} GB/saat` : '—'} />
                <Cell
                    label="WAL birikimi"
                    value={
                        state.walBacklogMb == null ? '—' : `${state.walBacklogMb} / ${control.maxWalBacklogMb} MB`
                    }
                    tone={
                        state.walBacklogMb != null && state.walBacklogMb >= control.maxWalBacklogMb
                            ? 'red'
                            : undefined
                    }
                />
                <Cell label="Son parti" value={formatDateTime(control.lastBatchAtUtc) || '—'} />
            </dl>

            <p className="text-xs text-slate-400 dark:text-slate-500">
                Parti {control.batchSize} satır · {control.pauseMs} ms ara
                {control.startedAtUtc && ` · başlangıç ${formatDateTime(control.startedAtUtc)}`}
            </p>
        </div>
    );
}

function BlockedPanel({ ids }: { ids: string[] }) {
    const [copied, setCopied] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(ids.join('\n'));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    }

    return (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-red-800 dark:text-red-200">
                    Kanıtlanamayan satır ({ids.length}) — iş durdu
                </span>
                <button
                    type="button"
                    onClick={copy}
                    className="ml-auto rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-800 transition hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900"
                >
                    {copied ? 'kopyalandı' : 'Kopyala'}
                </button>
            </div>
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                Bu satırların deposu kolonla eşleşmedi, bu yüzden silinmediler ve iş durduruldu.
            </p>
            <ul className="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-red-800 dark:text-red-200">
                {ids.map((id) => (
                    <li key={id}>{id}</li>
                ))}
            </ul>
        </div>
    );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'red' | 'sky' }) {
    const valueTone =
        tone === 'red'
            ? 'text-red-600 dark:text-red-400'
            : tone === 'emerald'
              ? 'text-emerald-600 dark:text-emerald-400'
              : tone === 'sky'
                ? 'text-sky-600 dark:text-sky-400'
                : 'text-slate-800 dark:text-slate-100';

    return (
        <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {label}
            </dt>
            <dd className={`text-sm font-semibold tabular-nums ${valueTone}`}>{value}</dd>
        </div>
    );
}
