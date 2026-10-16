import { useRef, useState } from 'react';
import { describeError } from '../../api/http';
import {
    SERVICE_DEFINITIONS,
    VERSION_ENVIRONMENTS,
    fetchServiceVersion,
    parseVersionBanner,
    serviceVersionUrl,
    versionCellKey,
    type ServiceDefinition,
} from '../../api/serviceVersions';
import { ENV_ACCENT } from '../../components/envAccent';
import type { ServiceEnvironment } from '../../config/environments';

/**
 * Test ve Prod'daki Service.Api / Gib.Api / Login.Api sürümlerini gösterir.
 *
 * Asıl sorulan soru "bu değişiklik yayına çıktı mı" ve cevabı iki sürümü yan yana görmekte.
 * Bu yüzden ekran seçili ortamdan BAĞIMSIZ: üstteki ortam seçici ne olursa olsun burada
 * her zaman iki ortam da sorulur. Uçlar `[AllowAnonymous]` ve salt okuma olduğu için
 * Prod'a bakmak da zararsız; onay kutusu gerektirmez.
 *
 * Açılışta kendiliğinden sorgu yapılmaz — bu araçta ekran açmak hiçbir zaman istek üretmez.
 * "Tümünü sorgula" tek tıkla altısını birden getirir.
 */

type CellStatus = 'idle' | 'loading' | 'ok' | 'error';

interface CellState {
    status: CellStatus;
    /** Ayrıştırılabildiyse sürüm; biçim bozuksa boş kalır ve ham satır gösterilir. */
    version: string;
    appName: string;
    raw: string;
    error: string;
    /** Son başarılı/başarısız okumanın saati. */
    at: string;
}

const EMPTY_CELL: CellState = { status: 'idle', version: '', appName: '', raw: '', error: '', at: '' };

export function ServiceVersionsPage() {
    const [cells, setCells] = useState<Record<string, CellState>>({});

    // Ekrandan çıkılınca ya da yeni sorgu başlayınca uçuştaki istekler iptal edilsin.
    const abortRef = useRef<AbortController | null>(null);

    function cellOf(serviceId: ServiceDefinition['id'], environment: ServiceEnvironment): CellState {
        return cells[versionCellKey(serviceId, environment.key)] ?? EMPTY_CELL;
    }

    function patchCell(key: string, patch: Partial<CellState>): void {
        setCells((previous) => ({ ...previous, [key]: { ...(previous[key] ?? EMPTY_CELL), ...patch } }));
    }

    async function load(service: ServiceDefinition, environment: ServiceEnvironment): Promise<void> {
        const key = versionCellKey(service.id, environment.key);
        const url = serviceVersionUrl(service, environment);

        patchCell(key, { status: 'loading', error: '' });

        const controller = abortRef.current ?? new AbortController();

        abortRef.current = controller;

        try {
            const result = await fetchServiceVersion(url, controller.signal);
            const at = new Date().toLocaleTimeString('tr-TR');

            if (!result.isSuccess) {
                patchCell(key, {
                    status: 'error',
                    error: result.error || `Status Code: ${result.status}`,
                    at,
                });

                return;
            }

            const banner = parseVersionBanner(result.content);

            patchCell(key, {
                status: 'ok',
                version: banner?.version ?? '',
                appName: banner?.appName ?? '',
                raw: result.content.trim(),
                error: '',
                at,
            });
        } catch (error) {
            if (controller.signal.aborted) {
                return;
            }

            patchCell(key, { status: 'error', error: describeError(error), at: new Date().toLocaleTimeString('tr-TR') });
        }
    }

    async function loadAll(): Promise<void> {
        // Altı istek paralel: hepsi bağımsız ve tek satırlık yanıt döndürüyor.
        await Promise.all(
            SERVICE_DEFINITIONS.flatMap((service) =>
                VERSION_ENVIRONMENTS.map((environment) => load(service, environment)),
            ),
        );
    }

    const isBusy = Object.values(cells).some((d) => d.status === 'loading');

    return (
        <div className="safe-x safe-bottom mx-auto max-w-4xl pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Servislerin yayındaki sürümleri. Üstteki ortam seçiminden bağımsızdır; her zaman Test ve
                    Prod birlikte sorulur.
                </p>

                <button
                    type="button"
                    onClick={() => void loadAll()}
                    disabled={isBusy}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                    {isBusy ? 'Sorgulanıyor…' : 'Tümünü sorgula'}
                </button>
            </div>

            <div className="mt-4 space-y-3">
                {SERVICE_DEFINITIONS.map((service) => {
                    const known = VERSION_ENVIRONMENTS.map((environment) => cellOf(service.id, environment)).filter(
                        (d) => d.status === 'ok' && d.version,
                    );

                    // İki ortam da okunduysa ve sürümler ayrıysa söyle: ekranın asıl sorusu bu.
                    const isDiffering =
                        known.length === VERSION_ENVIRONMENTS.length &&
                        new Set(known.map((d) => d.version)).size > 1;

                    return (
                        <section
                            key={service.id}
                            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                        >
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                                    {service.name}
                                </h2>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {service.description}
                                </span>

                                {isDiffering && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                        Test ve Prod farklı
                                    </span>
                                )}
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {VERSION_ENVIRONMENTS.map((environment) => (
                                    <VersionCell
                                        key={environment.key}
                                        environment={environment}
                                        url={serviceVersionUrl(service, environment)}
                                        state={cellOf(service.id, environment)}
                                        onLoad={() => void load(service, environment)}
                                    />
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>

            <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                Sürüm bilgisi her servisin <code>test</code> ucundan okunur. Bu uçlar kimlik doğrulaması ve
                servis anahtarı istemez, veritabanına dokunmaz.
            </p>
        </div>
    );
}

interface CellProps {
    environment: ServiceEnvironment;
    url: string;
    state: CellState;
    onLoad: () => void;
}

function VersionCell({ environment, url, state, onLoad }: CellProps) {
    const accent = ENV_ACCENT[environment.key];

    return (
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${accent.chip}`}>
                    {environment.name}
                </span>

                <button
                    type="button"
                    onClick={onLoad}
                    disabled={state.status === 'loading'}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    {state.status === 'loading' ? 'Sorgulanıyor…' : 'Sorgula'}
                </button>
            </div>

            <p className="mt-2 font-mono text-lg font-semibold text-slate-900 dark:text-slate-50">
                {state.status === 'ok' ? state.version || '—' : state.status === 'error' ? '—' : '·'}
            </p>

            {/* Biçim bozulduysa sürüm boş kalır; ham satır o zaman tek ipucu. */}
            {state.status === 'ok' && !state.version && state.raw && (
                <p className="mt-1 break-all font-mono text-[11px] text-amber-700 dark:text-amber-300">
                    {state.raw}
                </p>
            )}

            {state.status === 'ok' && state.appName && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{state.appName}</p>
            )}

            {state.status === 'error' && (
                <p className="mt-1 break-all text-xs text-red-700 dark:text-red-300">{state.error}</p>
            )}

            <p className="mt-2 break-all font-mono text-[10px] text-slate-400 dark:text-slate-600">{url}</p>

            {state.at && (
                <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-600">okundu: {state.at}</p>
            )}
        </div>
    );
}
