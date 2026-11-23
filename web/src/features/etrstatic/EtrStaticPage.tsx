import { useEffect, useRef, useState } from 'react';
import { checkHealth, getRefreshStatus, isValidIdentifier, lookupUsers, startRefresh } from '../../api/etrStatic';
import type { EtrUser, HealthResult, LookupKind, RefreshKind, RefreshStatus } from '../../api/etrStatic';
import { describeError } from '../../api/http';
import { useAuth } from '../../auth/useAuth';
import { isEtrStaticBlockedByMixedContent } from '../../config/environments';
import { formatDateTime } from '../../format';
import { ConfirmDialog } from '../console/ConfirmDialog';
import { inputClass } from '../console/formControls';
import { formatElapsed, parseRecordCount, watchRefresh } from './refreshWatch';

/**
 * Etr-static servisi: durum sorgulama, kayıtlı kullanıcı listesini (e-Fatura / e-İrsaliye mükellefleri)
 * yenileme ve numaraya göre kayıt sorgulama. Servis seçili ortamın etr-static adresidir.
 */

const cardClass = 'rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';

const primaryButton =
    'rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white';

export function EtrStaticPage() {
    const { environment } = useAuth();
    const baseUrl = environment.etrStaticBaseUrl;

    return (
        <div className="safe-x safe-bottom mx-auto max-w-4xl space-y-4 pt-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                <span className="font-medium">{environment.name}</span> ortamının etr-static servisi:{' '}
                <span className="break-all font-mono text-xs">{baseUrl}</span>
            </p>

            {isEtrStaticBlockedByMixedContent(environment) && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Konsol https, servis http — tarayıcı bu çağrıları engelleyecek.
                </p>
            )}

            <HealthCard baseUrl={baseUrl} />

            <RefreshCard
                baseUrl={baseUrl}
                kind="users1"
                title="Kullanıcı listesi 1 — refreshInvoiceUsers"
                description="GİB listesini indirip etr.dbt_einvoice_users tablosuna yazar (e-Fatura + e-İrsaliye)."
                requiresConfirmation={environment.requiresConfirmation}
            />

            <RefreshCard
                baseUrl={baseUrl}
                kind="users2"
                title="Kullanıcı listesi 2 — refreshInvoiceUsers2"
                description="Aynı listeyi etr.dbt_einvoice_users2 tablosuna sayaçlı yeni biçimde yazar."
                requiresConfirmation={environment.requiresConfirmation}
            />

            <LookupCard baseUrl={baseUrl} />
        </div>
    );
}

// ---------------------------------------------------------------- servis durumu

function HealthCard({ baseUrl }: { baseUrl: string }) {
    const [health, setHealth] = useState<HealthResult | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [checkedAt, setCheckedAt] = useState('');

    async function run() {
        setIsBusy(true);

        const result = await checkHealth(baseUrl);

        setHealth(result);
        setCheckedAt(new Date().toLocaleTimeString('tr-TR'));
        setIsBusy(false);
    }

    return (
        <section className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">Servis durumu</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Servisin ayakta olup olmadığını (etr/test) ve yanıt süresini gösterir.
                    </p>
                </div>

                <button type="button" onClick={() => void run()} disabled={isBusy} className={primaryButton}>
                    {isBusy ? 'Sorgulanıyor…' : 'Durumu sorgula'}
                </button>
            </div>

            {health && (
                <div
                    className={[
                        'mt-3 rounded-xl px-4 py-3',
                        health.isUp
                            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                            : 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200',
                    ].join(' ')}
                >
                    <p className="text-base font-bold">{health.isUp ? 'Ayakta' : 'Ulaşılamıyor'}</p>
                    <p className="mt-0.5 text-xs">
                        {health.isUp
                            ? `Yanıt süresi ${health.elapsedMs} ms${health.version ? ` · sürüm ${health.version}` : ''}`
                            : health.error || `Beklenmeyen yanıt (durum ${health.status})`}
                        {checkedAt && ` · ${checkedAt}`}
                    </p>
                </div>
            )}
        </section>
    );
}

// ---------------------------------------------------------------- liste yenileme

type RefreshPhase = 'idle' | 'starting' | 'running' | 'done' | 'failed' | 'lost';

interface RefreshCardProps {
    baseUrl: string;
    kind: RefreshKind;
    title: string;
    description: string;
    requiresConfirmation: boolean;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function RefreshCard({ baseUrl, kind, title, description, requiresConfirmation }: RefreshCardProps) {
    const [phase, setPhase] = useState<RefreshPhase>('idle');
    const [status, setStatus] = useState<RefreshStatus | null>(null);
    const [note, setNote] = useState('');
    const [now, setNow] = useState(() => Date.now());
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    // Ekrandan çıkılınca ya da yeni izleme başlayınca eskisi durur.
    const runIdRef = useRef(0);

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        const runs = runIdRef;

        return () => {
            window.clearInterval(id);
            runs.current += 1;
        };
    }, []);

    async function read(): Promise<RefreshStatus | null> {
        const result = await getRefreshStatus(baseUrl, kind);

        return result.isSuccess ? result.data : null;
    }

    /** İzlemeyi başlatır; iş zaten koşuyorsa onu izler. */
    async function watch(runId: number) {
        setPhase('running');

        const outcome = await watchRefresh(
            read,
            (s) => {
                if (runIdRef.current === runId) {
                    setStatus(s);
                }
            },
            wait,
            () => runIdRef.current !== runId,
        );

        if (runIdRef.current !== runId || outcome.kind === 'aborted') {
            return;
        }

        if (outcome.kind === 'lost') {
            setPhase('lost');
            setNote(
                'İş bu istekte görünmüyor: servis birden çok kopyada koşuyor olabilir, durum başka bir kopyada tutuluyor. ' +
                    'Birkaç dakika sonra "Son durumu oku" ile tekrar bakın.',
            );

            return;
        }

        setStatus(outcome.status);
        setPhase(outcome.status.isOk === false ? 'failed' : 'done');
    }

    async function start() {
        setIsConfirmOpen(false);
        setNote('');
        setStatus(null);
        setPhase('starting');

        runIdRef.current += 1;

        const runId = runIdRef.current;
        const result = await startRefresh(baseUrl, kind);

        if (!result.isSuccess) {
            setPhase('failed');
            setNote(result.error || 'Başlatılamadı.');

            return;
        }

        if (result.data?.message === 'already running') {
            setNote('Zaten çalışan bir yenileme var; o izleniyor.');
        }

        await watch(runId);
    }

    /** İş başlatmadan, sunucudaki son durumu okur (başka yerden başlatılmış olabilir). */
    async function readLast() {
        setNote('');
        runIdRef.current += 1;

        const runId = runIdRef.current;
        const current = await read();

        if (!current) {
            setPhase('failed');
            setNote('Durum okunamadı.');

            return;
        }

        setStatus(current);

        if (current.running) {
            await watch(runId);

            return;
        }

        if (current.finishedUtc === null) {
            setPhase('idle');
            setNote('Servis son açılışından beri yenileme çalıştırılmamış (ya da bu kopya bilmiyor).');

            return;
        }

        setPhase(current.isOk === false ? 'failed' : 'done');
    }

    function handleStartClick() {
        if (requiresConfirmation) {
            setIsConfirmOpen(true);

            return;
        }

        void start();
    }

    const isBusy = phase === 'starting' || phase === 'running';
    const startedMs = status?.startedUtc ? Date.parse(status.startedUtc) : null;
    const finishedMs = status?.finishedUtc ? Date.parse(status.finishedUtc) : null;
    const count = parseRecordCount(status?.message ?? null);

    return (
        <section className={cardClass}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>

            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={handleStartClick} disabled={isBusy} className={primaryButton}>
                    {isBusy ? 'Çalışıyor…' : 'Yenile'}
                </button>
                <button
                    type="button"
                    onClick={() => void readLast()}
                    disabled={isBusy}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Son durumu oku
                </button>
            </div>

            {phase !== 'idle' && (
                <div className="mt-3 space-y-1 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-950">
                    <p className="font-semibold">
                        {phase === 'starting' && 'Başlatılıyor…'}
                        {phase === 'running' && 'Çalışıyor — bitince sonuç burada görünür'}
                        {phase === 'done' && 'Tamamlandı'}
                        {phase === 'failed' && 'Hata'}
                        {phase === 'lost' && 'İzlenemiyor'}
                    </p>

                    {startedMs !== null && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                            Başladı: {formatDateTime(status?.startedUtc)} · Süre:{' '}
                            {formatElapsed(startedMs, finishedMs ?? now)}
                            {finishedMs !== null && ` · Bitti: ${formatDateTime(status?.finishedUtc)}`}
                        </p>
                    )}

                    {phase === 'done' && count !== null && (
                        <p className="text-xs text-emerald-800 dark:text-emerald-300">{count.toLocaleString('tr-TR')} kayıt yazıldı.</p>
                    )}

                    {status?.message && (
                        <p className="break-all font-mono text-[11px] text-slate-600 dark:text-slate-400">{status.message}</p>
                    )}
                </div>
            )}

            {note && <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">{note}</p>}

            {isConfirmOpen && (
                <ConfirmDialog
                    title="Prod ortamında liste yenilenecek"
                    summary={[`İşlem : ${title}`, `Servis : ${baseUrl}`]}
                    requiredText="PROD"
                    onConfirm={() => void start()}
                    onCancel={() => setIsConfirmOpen(false)}
                />
            )}
        </section>
    );
}

// ---------------------------------------------------------------- VKN sorgusu

interface LookupResult {
    kind: LookupKind;
    users: EtrUser[] | null;
    error: string;
}

const LOOKUP_LABELS: Record<LookupKind, string> = {
    invoice: 'e-Fatura',
    despatch: 'e-İrsaliye',
};

function LookupCard({ baseUrl }: { baseUrl: string }) {
    const [identifier, setIdentifier] = useState('');
    const [results, setResults] = useState<LookupResult[] | null>(null);
    const [queried, setQueried] = useState('');
    const [formError, setFormError] = useState('');
    const [isBusy, setIsBusy] = useState(false);

    async function run() {
        if (!isValidIdentifier(identifier)) {
            setFormError('VKN 10, TCKN 11 haneli olmalı.');

            return;
        }

        setFormError('');
        setIsBusy(true);

        const value = identifier.trim();
        const kinds: LookupKind[] = ['invoice', 'despatch'];

        try {
            const answers = await Promise.all(
                kinds.map(async (kind): Promise<LookupResult> => {
                    const result = await lookupUsers(baseUrl, kind, value);

                    if (!result.isSuccess) {
                        return { kind, users: null, error: result.error || 'Sorgulanamadı' };
                    }

                    return { kind, users: Array.isArray(result.data) ? result.data : [], error: '' };
                }),
            );

            setResults(answers);
            setQueried(value);
        } catch (caught) {
            setFormError(describeError(caught));
        } finally {
            setIsBusy(false);
        }
    }

    return (
        <section className={cardClass}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">VKN / TCKN sorgula</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Numaranın e-Fatura ve e-İrsaliye kayıtlı kullanıcı listesinde olup olmadığını gösterir.
            </p>

            <form
                className="mt-3 flex flex-wrap gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    void run();
                }}
            >
                <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    inputMode="numeric"
                    placeholder="VKN (10) ya da TCKN (11)"
                    aria-label="VKN veya TCKN"
                    className={`${inputClass} max-w-xs font-mono`}
                />
                <button type="submit" disabled={isBusy} className={primaryButton}>
                    {isBusy ? 'Sorgulanıyor…' : 'Sorgula'}
                </button>
            </form>

            {formError && (
                <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
                    {formError}
                </p>
            )}

            {results && (
                <div className="mt-3 space-y-3">
                    {results.map((result) => (
                        <LookupBlock key={result.kind} result={result} identifier={queried} />
                    ))}
                </div>
            )}
        </section>
    );
}

function LookupBlock({ result, identifier }: { result: LookupResult; identifier: string }) {
    const label = LOOKUP_LABELS[result.kind];

    if (result.users === null) {
        return (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
                <p className="font-bold">{label}: sorgulanamadı</p>
                <p className="break-all text-xs">{result.error}</p>
            </div>
        );
    }

    const isRegistered = result.users.length > 0;

    return (
        <div
            className={[
                'rounded-xl px-4 py-3 text-sm',
                isRegistered
                    ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
            ].join(' ')}
        >
            <p className="font-bold">
                {label}: {isRegistered ? `kayıtlı (${result.users.length} etiket)` : 'kayıtlı kullanıcı değil'}
            </p>

            {!isRegistered && <p className="text-xs">{identifier} bu listede bulunamadı.</p>}

            {isRegistered && (
                <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="text-slate-600 dark:text-slate-400">
                                <th className="py-1 pr-3">Unvan</th>
                                <th className="py-1 pr-3">Etiket (alias)</th>
                                <th className="py-1 pr-3">Tür</th>
                                <th className="py-1 pr-3">Hesap</th>
                                <th className="py-1">Etiket tarihi</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                            {result.users.map((user) => (
                                <tr key={`${user.id}-${user.alias}`} className="border-t border-emerald-200 dark:border-emerald-900">
                                    <td className="py-1 pr-3">{user.title}</td>
                                    <td className="break-all py-1 pr-3">{user.alias}</td>
                                    <td className="py-1 pr-3">{user.type}</td>
                                    <td className="py-1 pr-3">{user.accountType}</td>
                                    <td className="py-1">{formatDateTime(user.aliasCreationTime) || user.aliasCreationTime}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
