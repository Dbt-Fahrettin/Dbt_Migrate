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
import { ACTIONS, buildPatch } from './nightlyActions';
import { PackRequeryPanel } from './PackRequeryPanel';
import { XmlPurgePanel } from './XmlPurgePanel';
import type { ActionKind } from './nightlyActions';

/**
 * GİB API işlemleri — gece sorgulama servisinin iki anahtarı.
 *
 * Bu uçlar Service.Api'nin master uçlarının aksine `[Authorize]` altında; istekler girişte
 * alınan belirteçle imzalanıyor (bkz. api/gibClient.ts).
 *
 * Durum okuma TanStack Query ile: ekran açılır açılmaz sorgulanır, "Durum Kontrolü" aynı sorguyu
 * yeniler, değişiklik sonucu ikinci istek atmadan önbelleğe yazılır.
 */

export function GibNightlyPage() {
    const { environment, user } = useAuth();
    const queryClient = useQueryClient();

    const [pending, setPending] = useState<ActionKind | null>(null);
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

    const state = stateQuery.data ?? null;

    const actionMutation = useMutation({
        mutationFn: async (action: ActionKind) => {
            const result = await setNightlyState(environment.gibApiBaseUrl, token, buildPatch(action, state));

            if (!result.isSuccess || !result.data) {
                throw new Error(describeGibFailure(result));
            }

            return result.data;
        },
        onSuccess: (data, action) => {
            queryClient.setQueryData(queryKey, data);
            setNotice(ACTIONS[action].notice);
        },
    });

    const isBusy = stateQuery.isFetching || actionMutation.isPending;
    const error = actionMutation.error?.message || (stateQuery.error?.message ?? '');

    function request(action: ActionKind) {
        setNotice('');

        // Prod'da her yön sonuç doğuruyor: kapatmak o gecenin faturalarının çekilmemesi,
        // açmak GİB'e yük, AutoStart ise yeniden başlatma davranışını değiştiriyor.
        if (environment.requiresConfirmation) {
            setPending(action);

            return;
        }

        actionMutation.mutate(action);
    }

    function confirmPending() {
        if (!pending) {
            return;
        }

        const action = pending;

        setPending(null);
        setNotice('');
        actionMutation.mutate(action);
    }

    return (
        <div className="safe-x safe-bottom mx-auto max-w-4xl space-y-4 pt-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Gece Sorgulama Servisi</h2>
                <p className="mt-1 font-mono text-[11px] break-all text-slate-500 dark:text-slate-400">
                    {gibEndpoints.nightlyState(environment.gibApiBaseUrl)}
                </p>

                {isMixedContentBlocked && (
                    <Warning>Konsol https, Gib.Api http — tarayıcı bu çağrıları engelleyecek.</Warning>
                )}

                {isExpired && (
                    <Warning>
                        Giriş belirtecinizin süresi dolmuş. Bu ekrandaki uçlar kimlik istediği için 401 dönecek —
                        çıkış yapıp tekrar girin.
                    </Warning>
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

                <div className="mt-5 space-y-3">
                    <ButtonRow label="Durum">
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
                    </ButtonRow>

                    <ButtonRow label="Gece servisi">
                        <ActionButton
                            action="enable"
                            tone="bg-emerald-600 hover:bg-emerald-500"
                            disabled={isBusy || state?.isEnabled === true}
                            onClick={request}
                        />
                        <ActionButton
                            action="disable"
                            tone="bg-red-600 hover:bg-red-500"
                            disabled={isBusy || state?.isEnabled === false}
                            onClick={request}
                        />
                    </ButtonRow>

                    <ButtonRow label="AutoStart">
                        <ActionButton
                            action="autostart-on"
                            tone="bg-sky-600 hover:bg-sky-500"
                            disabled={isBusy || state?.autoStartEnabled === true}
                            onClick={request}
                        />
                        <ActionButton
                            action="autostart-off"
                            tone="bg-slate-600 hover:bg-slate-500"
                            disabled={isBusy || state?.autoStartEnabled === false}
                            onClick={request}
                        />
                    </ButtonRow>
                </div>

                <div className="mt-4 space-y-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    <p>
                        <strong>AutoStart</strong>, pencere açıldığında gece sorgusunun kendiliğinden açılıp
                        açılmayacağını belirler. Kapalıyken her yeniden başlatmadan sonra gece servisini elle açmak
                        gerekir.
                    </p>
                    <p>
                        <strong>Gece servisini kapatmak AutoStart’ı da kapatır</strong> — bu sunucunun kasıtlı
                        davranışı. AutoStart düğmeleri ise gece servisinin durumuna dokunmaz.
                    </p>
                    <p>
                        Durum veritabanında tutulur (tek satır, küme geneli) ve yeniden başlatmayı aşar. Tablo ilk
                        kurulduğunda satır kapalı varsayılanla yazılır — yani yeni bir kurulumda ikisi de kapalı
                        başlar.
                    </p>
                    {state && <p>Son sorgu: {formatDateTime(new Date(stateQuery.dataUpdatedAt).toISOString())}</p>}
                </div>

                {token && (
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        Giriş belirteci: {formatTokenRemaining(token)} geçerli.
                    </p>
                )}
            </section>

            <PackRequeryPanel />

            <XmlPurgePanel />

            {pending && (
                <ConfirmDialog
                    title={`Prod: ${ACTIONS[pending].label}`}
                    summary={[
                        `İşlem : ${ACTIONS[pending].label}`,
                        `Servis : ${environment.gibApiBaseUrl}`,
                        ACTIONS[pending].effect,
                    ]}
                    requiredText={ACTIONS[pending].confirmWord}
                    onConfirm={confirmPending}
                    onCancel={() => setPending(null)}
                />
            )}
        </div>
    );
}

function Warning({ children }: { children: React.ReactNode }) {
    return (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {children}
        </p>
    );
}

function ButtonRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {label}
            </span>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">{children}</div>
        </div>
    );
}

function ActionButton({
    action,
    tone,
    disabled,
    onClick,
}: {
    action: ActionKind;
    tone: string;
    disabled: boolean;
    onClick: (action: ActionKind) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onClick(action)}
            disabled={disabled}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-40 ${tone}`}
        >
            {ACTIONS[action].label}
        </button>
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
            <div className="grid gap-2 sm:grid-cols-2">
                <StatePill
                    label="Gece servisi"
                    isOn={state.isEnabled}
                    detail={state.isWithinExecutionWindow ? 'pencere içinde (18:00–07:00)' : 'pencere dışında'}
                />
                <StatePill
                    label="AutoStart"
                    isOn={state.autoStartEnabled}
                    detail={
                        state.autoStartEnabled
                            ? 'yeniden başlayınca kendiliğinden açılır'
                            : 'yeniden başlayınca elle açmak gerekir'
                    }
                />
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {state.mode && <Cell label="Şu an" value={state.mode} />}
                <Cell label="Sorgulanan gün" value={formatDate(state.activeQueryDate) || '-'} />
                <Cell label="Son sayaç" value={String(state.lastCounter)} />
                <Cell label="Güncellenme" value={formatDateTime(state.updatedAtUtc) || '-'} />
            </dl>
        </div>
    );
}

function StatePill({ label, isOn, detail }: { label: string; isOn: boolean; detail: string }) {
    return (
        <div
            className={[
                'rounded-lg px-3 py-2.5',
                isOn
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
            ].join(' ')}
        >
            <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${isOn ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <span className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</span>
                <span className="font-semibold">{isOn ? 'AÇIK' : 'KAPALI'}</span>
            </div>
            <p className="mt-0.5 text-xs opacity-80">{detail}</p>
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
