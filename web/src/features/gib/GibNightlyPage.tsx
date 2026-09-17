import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeGibFailure, getNightlyState, setNightlyState } from '../../api/gibClient';
import type { NightlyQueryState } from '../../api/gibClient';
import { gibEndpoints } from '../../api/endpoints';
import { formatTokenRemaining, isTokenExpired } from '../../auth/token';
import { useAuth } from '../../auth/useAuth';
import { isGibBlockedByMixedContent } from '../../config/environments';
import { formatDate, formatDateTime } from '../../format';
import { ConfirmDialog } from '../console/ConfirmDialog';

/**
 * GİB API işlemleri — Gib.Api gece sorgulama servisinin çalışma zamanı anahtarı.
 *
 * Bu uçlar Service.Api'nin master uçlarından farklı olarak `[Authorize]` altında; istekler
 * girişte alınan belirteçle imzalanıyor (bkz. api/gibClient.ts).
 *
 * Durum okuma TanStack Query ile: ekran açılır açılmaz sorgulanır, "Durum Kontrolü" düğmesi
 * aynı sorguyu yeniler, aç/kapat sonucu doğrudan önbelleğe yazılır (ikinci bir istek atmadan).
 */

type PendingAction = 'enable' | 'disable';

export function GibNightlyPage() {
    const { environment, user } = useAuth();
    const queryClient = useQueryClient();

    const [pending, setPending] = useState<PendingAction | null>(null);
    const [notice, setNotice] = useState('');

    const token = user?.lat ?? '';
    const isExpired = isTokenExpired(token);
    const isMixedContentBlocked = isGibBlockedByMixedContent(environment);

    const queryKey = ['gib-nightly-state', environment.key] as const;

    const stateQuery = useQuery({
        queryKey,
        queryFn: async ({ signal }) => {
            const result = await getNightlyState(environment.gibApiBaseUrl, token, signal);

            if (!result.isSuccess || !result.data) {
                throw new Error(describeGibFailure(result));
            }

            return result.data;
        },
    });

    const setStateMutation = useMutation({
        mutationFn: async (isEnabled: boolean) => {
            const result = await setNightlyState(environment.gibApiBaseUrl, token, isEnabled);

            if (!result.isSuccess || !result.data) {
                throw new Error(describeGibFailure(result));
            }

            return result.data;
        },
        onSuccess: (data, isEnabled) => {
            queryClient.setQueryData(queryKey, data);
            setNotice(isEnabled ? 'Gece servisi açıldı.' : 'Gece servisi kapatıldı.');
        },
    });

    const state = stateQuery.data ?? null;
    const isBusy = stateQuery.isFetching || setStateMutation.isPending;

    const error = setStateMutation.error?.message || (stateQuery.error?.message ?? '');

    function request(action: PendingAction) {
        setNotice('');

        // Prod'da her iki yön de sonuç doğuruyor: kapatmak sessiz veri kaybı, açmak GİB'e yük.
        if (environment.requiresConfirmation) {
            setPending(action);

            return;
        }

        setStateMutation.mutate(action === 'enable');
    }

    function confirmPending() {
        if (!pending) {
            return;
        }

        const isEnabled = pending === 'enable';

        setPending(null);
        setNotice('');
        setStateMutation.mutate(isEnabled);
    }

    return (
        <div className="safe-x safe-bottom mx-auto max-w-3xl space-y-4 pt-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Gece Sorgulama Servisi</h2>
                <p className="mt-1 font-mono text-[11px] break-all text-slate-500 dark:text-slate-400">
                    {gibEndpoints.nightlyState(environment.gibApiBaseUrl)}
                </p>

                {isMixedContentBlocked && (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        Konsol https, Gib.Api http — tarayıcı bu çağrıları engelleyecek.
                    </p>
                )}

                {isExpired && (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        Giriş belirtecinizin süresi dolmuş. Bu ekrandaki uçlar kimlik istediği için 401 dönecek —
                        çıkış yapıp tekrar girin.
                    </p>
                )}

                <StatusPanel state={state} isLoading={stateQuery.isPending} />

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

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={() => {
                            setNotice('');
                            void stateQuery.refetch();
                        }}
                        disabled={isBusy}
                        className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                        {stateQuery.isFetching ? 'Sorgulanıyor…' : 'Durum Kontrolü'}
                    </button>

                    <button
                        type="button"
                        onClick={() => request('enable')}
                        disabled={isBusy || state?.isEnabled === true}
                        className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                    >
                        Gece Servisini Aç
                    </button>

                    <button
                        type="button"
                        onClick={() => request('disable')}
                        disabled={isBusy || state?.isEnabled === false}
                        className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-40"
                    >
                        Gece Servisini Kapat
                    </button>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Durum <strong>bellekte</strong> tutulur: servis her yayın ve yeniden başlatmadan sonra{' '}
                    <strong>kapalı</strong> başlar, elle açılması gerekir. Bu bilinçli bir tasarım kararıdır, arıza
                    değildir.
                    {state && ` · Son sorgu: ${formatDateTime(new Date(stateQuery.dataUpdatedAt).toISOString())}`}
                </p>

                {token && (
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        Giriş belirteci: {formatTokenRemaining(token)} geçerli.
                    </p>
                )}
            </section>

            {pending && (
                <ConfirmDialog
                    title={pending === 'enable' ? 'Prod: gece servisi açılacak' : 'Prod: gece servisi kapatılacak'}
                    summary={[
                        `İşlem : ${pending === 'enable' ? 'Gece servisini aç' : 'Gece servisini kapat'}`,
                        `Servis : ${environment.gibApiBaseUrl}`,
                        pending === 'disable'
                            ? 'Kapalıyken gece sorgusu koşmaz; o günün faturaları çekilmez.'
                            : 'Açıldığında pencere içindeyse sorgu hemen başlar.',
                    ]}
                    requiredText={pending === 'enable' ? 'AC' : 'KAPAT'}
                    onConfirm={confirmPending}
                    onCancel={() => setPending(null)}
                />
            )}
        </div>
    );
}

function StatusPanel({ state, isLoading }: { state: NightlyQueryState | null; isLoading: boolean }) {
    if (!state) {
        return (
            <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
                {isLoading ? 'Durum sorgulanıyor…' : 'Durum okunamadı.'}
            </p>
        );
    }

    return (
        <div className="mt-4 space-y-3">
            <div
                className={[
                    'flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5',
                    state.isEnabled
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                ].join(' ')}
            >
                <span
                    className={`h-2.5 w-2.5 rounded-full ${state.isEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`}
                />
                <span className="font-semibold">{state.isEnabled ? 'AÇIK' : 'KAPALI'}</span>
                <span className="text-sm opacity-80">
                    {state.isWithinExecutionWindow ? '· pencere içinde (18:00–07:00)' : '· pencere dışında'}
                </span>
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Cell label="Açılışta başlat" value={state.autoStartEnabled ? 'evet' : 'hayır'} />
                <Cell label="Sorgulanan gün" value={formatDate(state.activeQueryDate) || '-'} />
                <Cell label="Son sayaç" value={String(state.lastCounter)} />
                <Cell label="Güncellenme" value={formatDateTime(state.updatedAtUtc) || '-'} />
            </dl>
        </div>
    );
}

function Cell({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {label}
            </dt>
            <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</dd>
        </div>
    );
}
