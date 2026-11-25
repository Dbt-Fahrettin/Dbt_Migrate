import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AZURE_ORG,
    AZURE_PROJECT,
    approveRelease,
    createRelease,
    describeAzureFailure,
    listBuildDefinitions,
    listBuilds,
    listReleaseDefinitions,
    listReleases,
    queueBuild,
    startEnvironment,
} from '../../api/azureDevOps';
import type { AdoBuild, AdoRelease, AdoReleaseEnvironment } from '../../api/azureDevOps';
import { describeError } from '../../api/http';
import type { ApiResult } from '../../api/http';
import { fullName } from '../../auth/types';
import { useAuth } from '../../auth/useAuth';
import {
    buildState,
    canStartEnvironment,
    confirmLines,
    environmentState,
    formatWhen,
    groupServices,
    isBuildRunning,
    isProdEnvironmentName,
    isReleaseActive,
    lastSucceededBuild,
    pendingApprovalOf,
    releaseDescription,
    sortServices,
} from './pipelineModel';
import type { ServiceGroup, ServiceOrders, StateLabel, Tone, Track } from './pipelineModel';

/**
 * Yayın hattı: dbt servislerinin Azure DevOps pipeline'ını başlatır, build bitince release oluşturur, canlı ortam
 * onayını verir. Migration bundan sonra Migration ekranından çalıştırılır (üstteki ortam seçimiyle).
 *
 * Kimlik kullanıcının kendi PAT'idir; Azure'da işlemi başlatan kişi kendi adıyla görünür. Test hattında işlem tek
 * tıktır; Test + Canlı hattında her yazma işleminden önce özet penceresi çıkar.
 */

const PAT_KEY = 'dbt-admin.azure-pat.v1';
const ORDER_KEY = 'dbt-admin.pipeline-order.v1';
const POLL_MS = 10_000;

function readOrders(): ServiceOrders {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(ORDER_KEY) ?? '{}');

        return parsed && typeof parsed === 'object' ? (parsed as ServiceOrders) : {};
    } catch {
        return {};
    }
}

function storeOrders(orders: ServiceOrders): void {
    try {
        window.localStorage.setItem(ORDER_KEY, JSON.stringify(orders));
    } catch {
        /* saklanamazsa yalnız bu oturumda geçerli kalır */
    }
}

const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const baseBtn = 'rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40';
const secondaryBtn = `${baseBtn} border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`;
const primaryBtn = `${baseBtn} border-sky-600 bg-sky-600 text-white hover:bg-sky-700`;
const warnBtn = `${baseBtn} border-amber-600 bg-amber-600 text-white hover:bg-amber-700`;

const TONE_CLS: Record<Tone, string> = {
    ok: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    bad: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
    run: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
    wait: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    idle: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

interface TrackData {
    builds: AdoBuild[];
    releases: AdoRelease[];
    error: string;
    busy: string;
}

const EMPTY: TrackData = { builds: [], releases: [], error: '', busy: '' };

interface Pending {
    title: string;
    lines: string[];
    run: () => Promise<void>;
}

function readStoredPat(): { pat: string; remember: boolean } {
    try {
        const local = window.localStorage.getItem(PAT_KEY);

        if (local) {
            return { pat: local, remember: true };
        }

        return { pat: window.sessionStorage.getItem(PAT_KEY) ?? '', remember: false };
    } catch {
        return { pat: '', remember: false };
    }
}

function storePat(pat: string, remember: boolean): void {
    try {
        window.localStorage.removeItem(PAT_KEY);
        window.sessionStorage.removeItem(PAT_KEY);

        if (pat) {
            (remember ? window.localStorage : window.sessionStorage).setItem(PAT_KEY, pat);
        }
    } catch {
        /* saklanamazsa yalnız bu oturumda bellekte kalır */
    }
}

interface Props {
    onOpenMigration?: () => void;
}

export function PipelinePanel({ onOpenMigration }: Props) {
    const { user } = useAuth();
    const actor = user ? fullName(user) : '';

    const [stored] = useState(readStoredPat);
    const [pat, setPat] = useState(stored.pat);
    const [patInput, setPatInput] = useState('');
    const [remember, setRemember] = useState(stored.remember);
    const [groups, setGroups] = useState<ServiceGroup[] | null>(null);
    const [data, setData] = useState<Record<string, TrackData>>({});
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [pending, setPending] = useState<Pending | null>(null);
    const [orders, setOrders] = useState<ServiceOrders>(readOrders);

    function setOrder(service: string, text: string): void {
        const next = { ...orders };
        const n = Number(text);

        if (text.trim() === '' || !Number.isFinite(n)) {
            delete next[service];
        } else {
            next[service] = n;
        }

        setOrders(next);
        storeOrders(next);
    }

    // Build bitince release'i kendiliğinden açılacak hatlar: hat anahtarı → izlenen build.
    // Ref yoklama döngüsü için, `watched` ekranda "bitince release açılacak" notu için.
    const autoRef = useRef(new Map<string, number>());
    const [watched, setWatched] = useState<string[]>([]);

    function watch(key: string, buildId: number | null): void {
        if (buildId === null) {
            autoRef.current.delete(key);
        } else {
            autoRef.current.set(key, buildId);
        }

        setWatched([...autoRef.current.keys()]);
    }
    const dataRef = useRef(data);
    const groupsRef = useRef(groups);

    useEffect(() => {
        dataRef.current = data;
        groupsRef.current = groups;
    }, [data, groups]);

    function patch(key: string, changes: Partial<TrackData>): void {
        setData((cur) => ({ ...cur, [key]: { ...(cur[key] ?? EMPTY), ...changes } }));
    }

    /** Azure hatasını (varsa) metne çevirir; yoksa boş döner. */
    function failureOf<T>(result: ApiResult<T>): string {
        return describeAzureFailure(result);
    }

    const refreshTrack = useCallback(
        async (track: Track, token: string): Promise<void> => {
            try {
                const [builds, releases] = await Promise.all([
                    listBuilds(token, track.build.id, 5),
                    listReleases(token, track.release.id, 3),
                ]);
                const failure = describeAzureFailure(builds) || describeAzureFailure(releases);

                if (failure) {
                    patch(track.key, { error: failure });

                    return;
                }

                const buildList = builds.data?.value ?? [];

                patch(track.key, { builds: buildList, releases: releases.data?.value ?? [], error: '' });

                // Kuyruğa alınan build başarıyla bitti → release aç.
                const watchedId = autoRef.current.get(track.key);
                const build = watchedId === undefined ? undefined : buildList.find((b) => b.id === watchedId);

                if (build && !isBuildRunning(build)) {
                    autoRef.current.delete(track.key);
                    setWatched([...autoRef.current.keys()]);

                    if (build.result === 'succeeded') {
                        const created = await createRelease(token, track.release.id, track.artifactAlias, build, releaseDescription(actor, build));
                        const createFailure = describeAzureFailure(created);

                        patch(track.key, { error: createFailure ? `Release açılamadı: ${createFailure}` : '' });

                        if (!createFailure) {
                            const again = await listReleases(token, track.release.id, 3);

                            patch(track.key, { releases: again.data?.value ?? [] });
                        }
                    } else {
                        patch(track.key, { error: `Build ${build.buildNumber} başarısız bitti; release açılmadı.` });
                    }
                }
            } catch (caught) {
                patch(track.key, { error: describeError(caught) });
            }
        },
        [actor],
    );

    async function loadAll(token: string): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const [builds, releases] = await Promise.all([listBuildDefinitions(token), listReleaseDefinitions(token)]);
            const failure = describeAzureFailure(builds) || describeAzureFailure(releases);

            if (failure) {
                setError(failure);
                setGroups(null);

                return;
            }

            const found = groupServices(builds.data?.value ?? [], releases.data?.value ?? []);

            setGroups(found);
            await Promise.all(found.flatMap((g) => g.tracks.map((t) => refreshTrack(t, token))));
        } catch (caught) {
            setError(describeError(caught));
        } finally {
            setLoading(false);
        }
    }

    function connect(): void {
        const token = patInput.trim();

        if (!token) {
            return;
        }

        storePat(token, remember);
        setPat(token);
        setPatInput('');
        void loadAll(token);
    }

    function disconnect(): void {
        storePat('', false);
        autoRef.current.clear();
        setWatched([]);
        setPat('');
        setGroups(null);
        setData({});
        setError('');
    }

    // Çalışan build / sürmekte olan release / onay bekleyen ortam varsa o hatları düzenli yenile.
    useEffect(() => {
        if (!pat) {
            return undefined;
        }

        const timer = window.setInterval(() => {
            for (const group of groupsRef.current ?? []) {
                for (const track of group.tracks) {
                    const d = dataRef.current[track.key];
                    const active =
                        autoRef.current.has(track.key) ||
                        isBuildRunning(d?.builds[0]) ||
                        (d?.releases ?? []).some(isReleaseActive);

                    if (active && !d?.busy) {
                        void refreshTrack(track, pat);
                    }
                }
            }
        }, POLL_MS);

        return () => window.clearInterval(timer);
    }, [pat, refreshTrack]);

    /** İşi çalıştırır; canlı hattında önce özet penceresi çıkar. */
    function act(track: Track, label: string, detail: string | undefined, work: () => Promise<string>): void {
        const run = async (): Promise<void> => {
            patch(track.key, { busy: label, error: '' });

            try {
                const failure = await work();

                patch(track.key, { error: failure });
            } catch (caught) {
                patch(track.key, { error: describeError(caught) });
            } finally {
                patch(track.key, { busy: '' });
                await refreshTrack(track, pat);
            }
        };

        if (track.kind === 'prod') {
            setPending({ title: `Canlı hattı: ${label}`, lines: confirmLines(label, track, detail), run });

            return;
        }

        void run();
    }

    function startBuild(track: Track, auto: boolean): void {
        act(track, auto ? 'Pipeline başlat + release aç' : 'Pipeline başlat', auto ? 'Build başarılı bitince release otomatik açılır.' : undefined, async () => {
            const result = await queueBuild(pat, track.build.id);
            const failure = failureOf(result);

            if (!failure && auto && result.data) {
                watch(track.key, result.data.id);
            }

            return failure;
        });
    }

    function newRelease(track: Track, build: AdoBuild): void {
        act(track, 'Release oluştur', `Build: ${build.buildNumber}`, async () =>
            failureOf(await createRelease(pat, track.release.id, track.artifactAlias, build, releaseDescription(actor, build))),
        );
    }

    function approve(track: Track, release: AdoRelease, env: AdoReleaseEnvironment): void {
        const approvalId = pendingApprovalOf(env);

        if (approvalId === null) {
            return;
        }

        act(track, `${env.name} ortamını onayla`, `Release: ${release.name}`, async () =>
            failureOf(await approveRelease(pat, approvalId, `Admin Console${actor ? ` (${actor})` : ''}`)),
        );
    }

    function startEnv(track: Track, release: AdoRelease, env: AdoReleaseEnvironment): void {
        act(track, `${env.name} ortamını başlat`, `Release: ${release.name}`, async () =>
            failureOf(await startEnvironment(pat, release.id, env.id, `Admin Console${actor ? ` (${actor})` : ''}`)),
        );
    }

    return (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Yayın hattı (Azure DevOps)</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {AZURE_ORG}/{AZURE_PROJECT} · pipeline başlat → release oluştur → canlı onayı. Migration yayından sonra
                        Migration ekranından çalıştırılır.
                    </p>
                </div>

                <div className="flex gap-2">
                    {pat && (
                        <>
                            <button type="button" className={secondaryBtn} disabled={loading} onClick={() => void loadAll(pat)}>
                                {loading ? 'Yenileniyor…' : 'Yenile'}
                            </button>
                            <button type="button" className={secondaryBtn} onClick={disconnect}>
                                PAT'i kaldır
                            </button>
                        </>
                    )}
                    {onOpenMigration && (
                        <button type="button" className={primaryBtn} onClick={onOpenMigration}>
                            Migration ekranı
                        </button>
                    )}
                </div>
            </div>

            {!pat && (
                <div className="mt-3 space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Azure DevOps kişisel erişim anahtarınızı (PAT) girin. Yetkiler: Build (Read &amp; execute), Release (Read,
                        write, execute &amp; manage). Anahtar yalnız bu cihazda saklanır.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="password"
                            autoComplete="off"
                            className={`${inputCls} max-w-md`}
                            placeholder="PAT"
                            value={patInput}
                            onChange={(e) => setPatInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && connect()}
                        />
                        <button type="button" className={primaryBtn} disabled={!patInput.trim()} onClick={connect}>
                            Bağlan
                        </button>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                            Bu cihazda hatırla
                        </label>
                    </div>
                </div>
            )}

            {error && (
                <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {error}
                </p>
            )}

            {pat && groups && groups.length === 0 && !loading && (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Release tanımı bulunamadı.</p>
            )}

            <div className="mt-3 space-y-3">
                {sortServices(groups ?? [], orders).map((group) => (
                    <div key={group.service} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-mono text-sm font-bold text-slate-900 dark:text-slate-50">{group.service}</h3>
                            <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                Sıra
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    className={`${inputCls} w-16 !py-0.5 text-xs`}
                                    value={orders[group.service] ?? ''}
                                    onChange={(e) => setOrder(group.service, e.target.value)}
                                />
                            </label>
                        </div>

                        <div className="mt-2 grid gap-2 lg:grid-cols-2">
                            {group.tracks.map((track) => (
                                <TrackCard
                                    key={track.key}
                                    track={track}
                                    state={data[track.key] ?? EMPTY}
                                    watching={watched.includes(track.key)}
                                    onBuild={(auto) => startBuild(track, auto)}
                                    onRelease={(build) => newRelease(track, build)}
                                    onApprove={(release, env) => approve(track, release, env)}
                                    onStartEnv={(release, env) => startEnv(track, release, env)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {pending && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onKeyDown={(e) => e.key === 'Escape' && setPending(null)}>
                    <div className="w-full max-w-md rounded-2xl border border-red-300 bg-white p-5 shadow-xl dark:border-red-900 dark:bg-slate-900">
                        <h2 className="text-base font-bold text-red-700 dark:text-red-300">{pending.title}</h2>
                        <ul className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                            {pending.lines.map((line) => (
                                <li key={line} className="break-all font-mono text-xs text-slate-700 dark:text-slate-300">
                                    {line}
                                </li>
                            ))}
                        </ul>
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Bu işlem canlı hattını etkiler. Devam edilsin mi?</p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" className={secondaryBtn} onClick={() => setPending(null)}>
                                Vazgeç
                            </button>
                            <button
                                type="button"
                                autoFocus
                                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500"
                                onClick={() => {
                                    const run = pending.run;

                                    setPending(null);
                                    void run();
                                }}
                            >
                                Çalıştır
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

function Chip({ state }: { state: StateLabel }) {
    return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLS[state.tone]}`}>{state.label}</span>;
}

interface CardProps {
    track: Track;
    state: TrackData;
    watching: boolean;
    onBuild: (auto: boolean) => void;
    onRelease: (build: AdoBuild) => void;
    onApprove: (release: AdoRelease, env: AdoReleaseEnvironment) => void;
    onStartEnv: (release: AdoRelease, env: AdoReleaseEnvironment) => void;
}

function TrackCard({ track, state, watching, onBuild, onRelease, onApprove, onStartEnv }: CardProps) {
    const latest = state.builds[0];
    const ready = lastSucceededBuild(state.builds);
    const busy = !!state.busy;

    return (
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
                <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        track.kind === 'prod' ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200' : 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200'
                    }`}
                >
                    {track.kind === 'prod' ? 'Test + Canlı' : 'Test'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{track.build.name}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-slate-500 dark:text-slate-400">Son build</span>
                {latest ? (
                    <>
                        <a className="font-mono font-semibold text-slate-900 underline-offset-2 hover:underline dark:text-slate-50" href={latest._links?.web?.href} target="_blank" rel="noreferrer">
                            {latest.buildNumber}
                        </a>
                        <Chip state={buildState(latest)} />
                        <span className="text-[11px] text-slate-400">{formatWhen(latest.finishTime ?? latest.queueTime)}</span>
                    </>
                ) : (
                    <span className="text-xs text-slate-400">—</span>
                )}
                {watching && <span className="text-[11px] text-sky-600 dark:text-sky-400">bitince release açılacak</span>}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={secondaryBtn} disabled={busy || isBuildRunning(latest)} onClick={() => onBuild(false)}>
                    Pipeline başlat
                </button>
                <button type="button" className={secondaryBtn} disabled={busy || isBuildRunning(latest)} onClick={() => onBuild(true)}>
                    Başlat + release aç
                </button>
                <button type="button" className={primaryBtn} disabled={busy || !ready} onClick={() => ready && onRelease(ready)}>
                    Release aç{ready ? ` (${ready.buildNumber})` : ''}
                </button>
            </div>

            {state.busy && <p className="mt-2 text-xs text-sky-600 dark:text-sky-400">{state.busy}…</p>}
            {state.error && <p className="mt-2 break-all text-xs text-red-700 dark:text-red-300">{state.error}</p>}

            {state.releases.length > 0 && (
                <ul className="mt-2 space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                    {state.releases.map((release) => (
                        <li key={release.id} className="text-xs">
                            <div className="flex flex-wrap items-center gap-x-2">
                                <a className="font-semibold text-slate-800 hover:underline dark:text-slate-100" href={release._links?.web?.href} target="_blank" rel="noreferrer">
                                    {release.name}
                                </a>
                                <span className="text-slate-400">{formatWhen(release.createdOn)}</span>
                                <span className="truncate text-slate-400">{release.createdBy?.displayName}</span>
                            </div>

                            <div className="mt-1 flex flex-wrap gap-2">
                                {(release.environments ?? []).map((env, index, envs) => (
                                    <span key={env.id} className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-1.5 py-0.5 dark:border-slate-700">
                                        <span className={isProdEnvironmentName(env.name) ? 'font-semibold text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'}>
                                            {env.name}
                                        </span>
                                        <Chip state={environmentState(env)} />
                                        {pendingApprovalOf(env) !== null && (
                                            <button type="button" className={warnBtn} disabled={busy} onClick={() => onApprove(release, env)}>
                                                Onayla
                                            </button>
                                        )}
                                        {canStartEnvironment(envs, index) && (
                                            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => onStartEnv(release, env)}>
                                                Başlat
                                            </button>
                                        )}
                                    </span>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
