import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { describeAutoIntegFailure, getAutoIntegStatus, postAutoInteg } from '../../api/autoInteg';
import type { AutoIntegAction, AutoIntegPack, AutoIntegStatus } from '../../api/autoInteg';
import type { ApiResult } from '../../api/http';
import { endpoints } from '../../api/endpoints';
import { describeError } from '../../api/http';
import { isPlausibleServiceKey, loadServiceKey } from '../../api/serviceKey';
import { fullName } from '../../auth/types';
import { useAuth } from '../../auth/useAuth';
import { ConfirmDialog } from '../console/ConfirmDialog';
import { formatDateTime } from '../../format';
import {
    PACK_FILTER_LABELS,
    allPacksText,
    confirmText,
    filterPacks,
    masterText,
    packStateText,
    parsePackNos,
} from './autoIntegModel';
import type { BulkAction, PackFilter } from './autoIntegModel';

/**
 * Otomatik Hazırlık Yönetimi: gece sorgulanan GİB faturalarından hazır fiş / Defter Beyan kaydı hazırlığını
 * yayın ya da ortam değişkeni değiştirmeden açıp kapatır — ana şalter, paket bazında aç / kapat, tüm paketlere aç / tümünü kapat.
 *
 * Seçili ortamı yönetir (üstteki ortam seçici); ekran hangisi olduğunu yazar. Uçlar servis anahtarı ister.
 * Toplu işlemler onay ister; Prod'da onay için ortam adı yazılır. Her işlemden sonra liste sunucunun cevabıyla yenilenir
 * ve hata ekranda görünür.
 */

type Phase = 'loading' | 'ok' | 'error';
type SortKey = 'packNo' | 'state' | 'companies' | 'scanned' | 'run';

const ACTION_LABELS: Record<string, string> = {
    master: 'Ana şalter',
    'packs-on': 'Paket açıldı',
    'packs-off': 'Paket kapatıldı',
    'packs-clear': 'Paket işareti kaldırıldı',
    'all-on': 'Tüm paketlere açıldı',
    'all-off': 'Tümü kapatıldı',
    reset: 'Anahtarlar silindi',
};

const TONE: Record<'on' | 'off' | 'file', string> = {
    on: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    off: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    file: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

export function AutoIntegPage() {
    const { environment, user } = useAuth();

    const [phase, setPhase] = useState<Phase>('loading');
    const [status, setStatus] = useState<AutoIntegStatus | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<BulkAction | null>(null);
    const [packText, setPackText] = useState('');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<PackFilter>('all');
    const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'packNo', dir: 1 });

    const abortRef = useRef<AbortController | null>(null);

    const apiBaseUrl = environment.apiBaseUrl;
    const hasKey = isPlausibleServiceKey(loadServiceKey(environment.apiBaseUrl));
    const actor = user ? `${fullName(user)} (${user.em ?? ''})` : 'bilinmiyor';

    /** Okuma sonucunu ekrana işler (ilk açılış ve "Yenile" aynı yolu kullanır). */
    const apply = useCallback((result: ApiResult<AutoIntegStatus>): void => {
        if (!result.isSuccess || !result.data) {
            setStatus(null);
            setError(describeAutoIntegFailure(result));
            setPhase('error');

            return;
        }

        setStatus(result.data);
        setPhase('ok');
    }, []);

    const fail = useCallback((caught: unknown, signal: AbortSignal): void => {
        if (signal.aborted) {
            return;
        }

        setStatus(null);
        setError(describeError(caught));
        setPhase('error');
    }, []);

    function load(): void {
        setPhase('loading');
        setError('');

        const controller = new AbortController();

        abortRef.current?.abort();
        abortRef.current = controller;

        getAutoIntegStatus(environment.apiBaseUrl, controller.signal).then(apply, (caught: unknown) => fail(caught, controller.signal));
    }

    // Ekran açılınca durumu okur (başlangıç evresi zaten 'loading'); ortam değişince sayfa yeniden kurulur (App.tsx key).
    useEffect(() => {
        const controller = new AbortController();

        abortRef.current = controller;
        getAutoIntegStatus(apiBaseUrl, controller.signal).then(apply, (caught: unknown) => fail(caught, controller.signal));

        return () => controller.abort();
    }, [apiBaseUrl, apply, fail]);

    /** Yazan işlem: sunucunun cevabı güncel durumdur (liste yeniden okunmadan yenilenir); hata ekranda kalır. */
    async function run(
        action: AutoIntegAction,
        body: { enabled?: boolean | null; packNos?: string[] } = {},
    ): Promise<boolean> {
        setBusy(true);
        setError('');

        try {
            const result = await postAutoInteg(environment.apiBaseUrl, action, { actor, ...body });

            if (!result.isSuccess || !result.data) {
                setError(describeAutoIntegFailure(result));

                return false;
            }

            setStatus(result.data);
            setPhase('ok');

            return true;
        } catch (caught) {
            setError(describeError(caught));

            return false;
        } finally {
            setBusy(false);
        }
    }

    async function runBulk(action: BulkAction): Promise<void> {
        switch (action) {
            case 'master-on':
                await run('master', { enabled: true });
                break;
            case 'master-off':
                await run('master', { enabled: false });
                break;
            case 'master-file':
                await run('master', { enabled: null });
                break;
            case 'all-on':
                await run('all-on');
                break;
            case 'all-off':
                await run('all-off');
                break;
            case 'reset':
                await run('reset');
                break;
        }

        setConfirm(null);
    }

    async function runPacks(action: 'packs/on' | 'packs/off' | 'packs/clear', text: string): Promise<void> {
        const parsed = parsePackNos(text);

        if (parsed.invalid.length > 0 || parsed.packs.length === 0) {
            setError(
                parsed.invalid.length > 0
                    ? `Geçersiz paket numarası: ${parsed.invalid.slice(0, 5).join(', ')}.`
                    : 'En az bir paket numarası girin.',
            );

            return;
        }

        if (await run(action, { packNos: parsed.packs }) && text === packText) {
            setPackText('');
        }
    }

    function toggleSort(key: SortKey): void {
        setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
    }

    const s = status;
    const m = s ? masterText({ master: s.master, settingsEnabled: s.settingsEnabled }) : null;
    const rows = s ? sortPacks(filterPacks(s.packs, search, filter), sort.key, sort.dir) : [];
    const cfg = confirm ? confirmText(confirm, environment.name) : null;

    return (
        <div className="safe-x safe-bottom mx-auto max-w-5xl pt-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Gece sorgulanan GİB faturalarından hazır fiş / Defter Beyan kaydı hazırlığını yayın ya da ortam
                değişkeni değiştirmeden buradan açıp kapatırsınız. Her firmanın kendi ayarı (Entegrasyon ekranı)
                ayrıca açık olmalıdır.
            </p>

            <p className="mt-3 text-sm">
                <span className="rounded bg-amber-100 px-2 py-1 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Yönettiğiniz ortam: {environment.name}
                </span>
                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                    Değişiklik yalnız bu ortamın servisine yazılır; ortamı üstteki seçiciden değiştirin.
                </span>
            </p>

            {!hasKey && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Bu ortam için servis anahtarı girilmemiş. Uçlar anahtarsız istekte <b>404</b> döner — anahtarı
                    Migration İşlemleri ekranındaki <b>Servis anahtarı</b> alanına yapıştırın.
                </p>
            )}

            {error && (
                <p
                    role="alert"
                    className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                >
                    {error}
                </p>
            )}

            {phase === 'loading' && !s && <p className="mt-4 text-sm text-slate-500">Sorgulanıyor…</p>}

            {phase === 'error' && (
                <button type="button" onClick={load} className={`mt-3 ${secondaryBtn}`}>
                    Yeniden dene
                </button>
            )}

            {s && m && (
                <>
                    <Section title={`Ana şalter (${environment.name})`}>
                        <div className="flex flex-wrap items-center gap-3">
                            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${TONE[m.tone]}`}>{m.label}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{m.detail}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                            Şu an iş bu ortamda <b>{s.active ? 'çalışıyor' : 'çalışmıyor'}</b>. Tarama aralığı{' '}
                            {s.sweepMinutes} dk
                            {s.lastTurnAt ? `, son tur ${formatDateTime(s.lastTurnAt)}` : ', henüz tur kaydı yok'}
                            {s.pendingCompanies > 0 && `, sırada bekleyen ${s.pendingCompanies} firma`}.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" disabled={busy || s.master === true} onClick={() => setConfirm('master-on')} className={secondaryBtn}>
                                Aç
                            </button>
                            <button type="button" disabled={busy || s.master === false} onClick={() => setConfirm('master-off')} className={dangerBtn}>
                                Kapat
                            </button>
                            <button type="button" disabled={busy || s.master == null} onClick={() => setConfirm('master-file')} className={secondaryBtn}>
                                Yapılandırma dosyasına dön
                            </button>
                        </div>
                    </Section>

                    <Section title={`Paketler (${environment.name})`}>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                            <b>{allPacksText(s.allPacks)}.</b>
                            {s.settingsPackNos.length > 0 && ` Yapılandırma dosyasındaki pilot liste: ${s.settingsPackNos.join(', ')}.`}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" disabled={busy} onClick={() => setConfirm('all-on')} className={secondaryBtn}>
                                Tüm paketlere aç
                            </button>
                            <button type="button" disabled={busy} onClick={() => setConfirm('all-off')} className={dangerBtn}>
                                Tümünü kapat
                            </button>
                            <button type="button" disabled={busy} onClick={() => setConfirm('reset')} className={secondaryBtn}>
                                Ekran anahtarlarını sıfırla
                            </button>
                        </div>

                        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                            <label htmlFor="autoint-packs" className="block text-xs text-slate-600 dark:text-slate-300">
                                Paket no (virgül, boşluk ya da satır ayraçlı birden çok paket yapıştırılabilir)
                            </label>
                            <div className="mt-1 flex flex-wrap items-start gap-2">
                                <textarea
                                    id="autoint-packs"
                                    rows={2}
                                    value={packText}
                                    onChange={(e) => setPackText(e.target.value)}
                                    placeholder="500123, 500124"
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono text-sm text-slate-900 sm:w-72 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                />
                                <button type="button" disabled={busy || !packText.trim()} onClick={() => void runPacks('packs/on', packText)} className={secondaryBtn}>
                                    Pakete aç
                                </button>
                                <button type="button" disabled={busy || !packText.trim()} onClick={() => void runPacks('packs/off', packText)} className={dangerBtn}>
                                    Pakete kapat
                                </button>
                                <button type="button" disabled={busy || !packText.trim()} onClick={() => void runPacks('packs/clear', packText)} className={secondaryBtn}>
                                    İşareti kaldır
                                </button>
                            </div>
                        </div>
                    </Section>

                    <section className="mt-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="mr-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Paket listesi ({rows.length}/{s.packs.length})
                            </h2>
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Paket no ara"
                                aria-label="Paket ara"
                                className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                            <select
                                value={filter}
                                onChange={(e) => setFilter(e.target.value as PackFilter)}
                                aria-label="Paket süzgeci"
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                                {(Object.keys(PACK_FILTER_LABELS) as PackFilter[]).map((k) => (
                                    <option key={k} value={k}>
                                        {PACK_FILTER_LABELS[k]}
                                    </option>
                                ))}
                            </select>
                            <button type="button" disabled={phase === 'loading'} onClick={load} className={secondaryBtn}>
                                {phase === 'loading' ? 'Yenileniyor…' : 'Yenile'}
                            </button>
                        </div>

                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Firma sayıları ve son tur bilgisi servisin kendi turlarında doldurduğu durumdan gelir (paket
                            veritabanlarına her açılışta bağlanılmaz); tur henüz uğramadıysa boş görünür. Tüm paketlere
                            açıkken yalnız ayarı açık firması olan paketler listelenir.
                        </p>

                        <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                    <tr>
                                        <Th onClick={() => toggleSort('packNo')} sort={sort} k="packNo">Paket no</Th>
                                        <Th onClick={() => toggleSort('state')} sort={sort} k="state">Durum</Th>
                                        <Th onClick={() => toggleSort('companies')} sort={sort} k="companies" right>Ayarı açık firma</Th>
                                        <Th onClick={() => toggleSort('scanned')} sort={sort} k="scanned">Son tarama</Th>
                                        <Th onClick={() => toggleSort('run')} sort={sort} k="run">Son tur</Th>
                                        <th className="px-3 py-2">Son sonuç</th>
                                        <th className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-3 py-4 text-slate-500">
                                                Bu süzgeçle paket yok.
                                            </td>
                                        </tr>
                                    )}
                                    {rows.map((p) => (
                                        <PackRow key={p.packNo} pack={p} busy={busy} onAction={(a) => void runPacks(a, String(p.packNo))} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <Section title="Son değişiklikler">
                        {s.log.length === 0 ? (
                            <p className="text-xs text-slate-500">Henüz değişiklik yapılmamış.</p>
                        ) : (
                            <ul className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                                {s.log.map((l, i) => (
                                    <li key={`${l.at}-${i}`} className="flex flex-wrap gap-x-3 py-1.5">
                                        <span className="w-36 shrink-0 text-slate-500">{formatDateTime(l.at)}</span>
                                        <span className="font-semibold text-slate-900 dark:text-slate-100">{ACTION_LABELS[l.action] ?? l.action}</span>
                                        {l.detail && <span className="text-slate-600 dark:text-slate-300">{l.detail}</span>}
                                        <span className="text-slate-500">{l.actor}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>
                </>
            )}

            <p className="mt-4 break-all font-mono text-[10px] text-slate-400 dark:text-slate-600">
                {endpoints.autoInteg(environment.apiBaseUrl, 'status')}
            </p>

            {confirm && cfg && (
                <ActionConfirm
                    title={cfg.title}
                    body={cfg.body}
                    button={cfg.button}
                    busy={busy}
                    typed={environment.requiresConfirmation ? environment.name : null}
                    onConfirm={() => void runBulk(confirm)}
                    onCancel={() => setConfirm(null)}
                />
            )}
        </div>
    );
}

const baseBtn = 'rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40';
const secondaryBtn = `${baseBtn} border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`;
const dangerBtn = `${baseBtn} border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950`;

function sortPacks(packs: AutoIntegPack[], key: SortKey, dir: 1 | -1): AutoIntegPack[] {
    const value = (p: AutoIntegPack): number | string => {
        switch (key) {
            case 'state':
                return p.allowed ? 1 : 0;
            case 'companies':
                return p.enabledCompanies ?? -1;
            case 'scanned':
                return p.scannedAt ?? '';
            case 'run':
                return p.lastRunAt ?? '';
            default:
                return p.packNo;
        }
    };

    return [...packs].sort((a, b) => {
        const x = value(a);
        const y = value(b);

        return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            {children}
        </section>
    );
}

function Th({ children, onClick, sort, k, right }: { children: ReactNode; onClick: () => void; sort: { key: SortKey; dir: 1 | -1 }; k: SortKey; right?: boolean }) {
    return (
        <th className={`px-3 py-2 ${right ? 'text-right' : ''}`} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
            <button type="button" onClick={onClick} className="font-semibold hover:text-slate-900 dark:hover:text-slate-100">
                {children}
                {sort.key === k && (sort.dir === 1 ? ' ▲' : ' ▼')}
            </button>
        </th>
    );
}

function PackRow({ pack: p, busy, onAction }: { pack: AutoIntegPack; busy: boolean; onAction: (a: 'packs/on' | 'packs/off' | 'packs/clear') => void }) {
    const open = p.allowed;

    return (
        <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">
            <td className="px-3 py-1.5 font-mono">{p.packNo}</td>
            <td className="px-3 py-1.5">
                <span
                    className={`rounded-full px-2 py-0.5 font-medium ${open ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                >
                    {packStateText(p)}
                </span>
            </td>
            <td className="px-3 py-1.5 text-right">{p.enabledCompanies ?? '—'}</td>
            <td className="px-3 py-1.5">{formatDateTime(p.scannedAt) || '—'}</td>
            <td className="px-3 py-1.5">{formatDateTime(p.lastRunAt) || '—'}</td>
            <td className="max-w-xs truncate px-3 py-1.5" title={p.lastResult ?? ''}>{p.lastResult ?? '—'}</td>
            <td className="px-3 py-1.5">
                <span className="flex justify-end gap-1">
                    {!open && (
                        <button type="button" disabled={busy} onClick={() => onAction('packs/on')} className={secondaryBtn}>
                            Aç
                        </button>
                    )}
                    {(open || p.explicit === 'on') && (
                        <button type="button" disabled={busy} onClick={() => onAction('packs/off')} className={secondaryBtn}>
                            Kapat
                        </button>
                    )}
                    {p.explicit && (
                        <button type="button" disabled={busy} onClick={() => onAction('packs/clear')} className={secondaryBtn}>
                            İşareti kaldır
                        </button>
                    )}
                </span>
            </td>
        </tr>
    );
}

/** Prod'da ortam adı yazdıran (mevcut ConfirmDialog), diğer ortamlarda düz onay penceresi. */
function ActionConfirm({
    title,
    body,
    button,
    busy,
    typed,
    onConfirm,
    onCancel,
}: {
    title: string;
    body: string;
    button: string;
    busy: boolean;
    typed: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    if (typed) {
        return <ConfirmDialog title={title} summary={[body]} requiredText={typed} onConfirm={onConfirm} onCancel={onCancel} />;
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    onCancel();
                }
            }}
        >
            <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{body}</p>
                <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className={secondaryBtn}>
                        Vazgeç
                    </button>
                    <button type="button" autoFocus disabled={busy} onClick={onConfirm} className={`${baseBtn} border-transparent bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900`}>
                        {busy ? 'Uygulanıyor…' : button}
                    </button>
                </div>
            </div>
        </div>
    );
}
