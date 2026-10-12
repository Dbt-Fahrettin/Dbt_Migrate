import { useCallback, useEffect, useRef, useState } from 'react';
import { gibEndpoints } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { ConfirmDialog } from '../console/ConfirmDialog';
import { Field, Label, inputClass } from '../console/formControls';
import { downloadText, fileStamp } from './faultyUrlReport';
import { DEFAULT_RESTORE_WINDOW, buildRestoreCsv, requeryRanges, runRestoreLoop } from './xmlRestoreLoop';
import type { RestoreRunState, RestoreTotals } from './xmlRestoreLoop';

/**
 * Onarımın yanlışlıkla boşalttığı XML'lerin geri yüklenmesi — `GibInvoiceQuery/RestoreClearedXml`.
 *
 * 09.10.2026 onarımı şahıs şirketlerinde doğru satırı da boşalttı (satırda VKN, faturada TCKN). Geri yükleme penceredeki
 * XML'i boş satırların belgesini kendi adresinden yeniden alır ve satırla tutarsa yazar. Adresi olmayan ya da indirilemeyen
 * satırlar paket ve tarih aralığıyla listelenir: Paket Yeniden Sorgu ile tamamlanır.
 */
export function ClearedXmlRestorePanel() {
    const { environment, user } = useAuth();
    const token = user?.lat ?? '';

    const [fromUtc, setFromUtc] = useState(DEFAULT_RESTORE_WINDOW.fromUtc);
    const [toUtc, setToUtc] = useState(DEFAULT_RESTORE_WINDOW.toUtc);
    const [state, setState] = useState<RestoreRunState>('idle');
    const [totals, setTotals] = useState<RestoreTotals | null>(null);
    const [error, setError] = useState('');
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const stopRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
            stopRef.current = true;
        };
    }, []);

    const start = useCallback(
        (dryRun: boolean) => {
            stopRef.current = false;
            setError('');
            setState('running');

            void runRestoreLoop({
                gibApiBaseUrl: environment.gibApiBaseUrl,
                token,
                fromUtc,
                toUtc,
                dryRun,
                maxRows: 40,
                shouldStop: () => stopRef.current,
                onProgress: (next) => mountedRef.current && setTotals(next),
                onError: (message) => mountedRef.current && setError(message),
            }).then((finalState) => mountedRef.current && setState(finalState));
        },
        [environment.gibApiBaseUrl, token, fromUtc, toUtc],
    );

    function download() {
        if (!totals) {
            return;
        }

        downloadText(
            `gib-xml-geri-yukleme-${totals.dryRun ? 'prova' : 'gercek'}-${environment.key}-${fileStamp(new Date().toISOString())}.csv`,
            buildRestoreCsv(totals),
            'text/csv;charset=utf-8',
        );
    }

    const isRunning = state === 'running';
    const ranges = totals ? requeryRanges(totals) : [];

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Boşaltılan XML'lerin Geri Yüklenmesi</h2>
            <p className="mt-1 font-mono text-[11px] break-all text-slate-500 dark:text-slate-400">
                {gibEndpoints.restoreClearedXml(environment.gibApiBaseUrl, fromUtc, toUtc, true, 0, 40)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                09.10.2026 onarımı şahıs şirketlerinde doğru satırı da boşalttı (satırda VKN, faturada aynı şahsın TCKN'si). Penceredeki
                XML'i boş satırların belgesi <strong>kendi adresinden</strong> (önce gib-hw) yeniden alınır; belge no satırla tutuyor ve
                taraf kesin başka biri değilse yazılır. Adresi olmayan ya da indirilemeyen satırlar paket ve tarihle listelenir.{' '}
                <strong>Önce Prova</strong>: indirir, yazmaz.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field>
                    <Label htmlFor="restoreFrom">Pencere başı (UTC)</Label>
                    <input id="restoreFrom" value={fromUtc} disabled={isRunning} onChange={(e) => setFromUtc(e.target.value)} className={`${inputClass} font-mono`} />
                </Field>
                <Field>
                    <Label htmlFor="restoreTo">Pencere sonu (UTC)</Label>
                    <input id="restoreTo" value={toUtc} disabled={isRunning} onChange={(e) => setToUtc(e.target.value)} className={`${inputClass} font-mono`} />
                </Field>
            </div>

            {error && (
                <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {error}
                </p>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => start(true)} disabled={isRunning} className="flex-1 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50">
                    {isRunning && totals?.dryRun ? 'Prova sürüyor…' : 'Prova'}
                </button>
                <button type="button" onClick={() => setIsConfirmOpen(true)} disabled={isRunning} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
                    {isRunning && totals && !totals.dryRun ? 'Geri yükleniyor…' : 'Geri yükle'}
                </button>
                <button type="button" onClick={() => (stopRef.current = true)} disabled={!isRunning} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    Durdur
                </button>
                <button type="button" onClick={download} disabled={!totals || totals.rows.length === 0} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    Liste (.csv)
                </button>
            </div>

            {totals && (
                <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        <strong>{totals.dryRun ? 'Prova' : 'Geri yükleme'}</strong> · {state} · {totals.callCount} çağrı · {Math.round(totals.elapsedSeconds)} sn
                    </p>
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <Cell label="Satır" value={totals.rowCount} />
                        <Cell label={totals.dryRun ? 'Yazılacak' : 'Yazıldı'} value={totals.writtenRows} tone="green" />
                        <Cell label="Adres yok" value={totals.noUrlRows} tone="amber" />
                        <Cell label="Alınamadı" value={totals.notFetchedRows} tone="amber" />
                        <Cell label="Reddedildi" value={totals.rejectedRows} tone="red" />
                    </dl>
                    {ranges.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            <p className="font-semibold">Paket Yeniden Sorgu ile tamamlanacaklar ({ranges.length} paket):</p>
                            <ul className="mt-1 max-h-40 overflow-auto font-mono">
                                {ranges.map((r) => (
                                    <li key={r.packNo}>
                                        paket {r.packNo} · {r.from} → {r.to} · {r.rows} satır
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {isConfirmOpen && (
                <ConfirmDialog
                    title={`${environment.key}: boşaltılan XML'ler geri yüklenecek`}
                    summary={[
                        `Pencere : ${fromUtc} → ${toUtc} (UTC)`,
                        'XML yalnız boş satırlara, satırın kendi adresinden alınan ve satırla tutan belgeyle yazılır.',
                        'Önce Prova sonucunu inceleyin.',
                    ]}
                    requiredText="GERI YUKLE"
                    onConfirm={() => {
                        setIsConfirmOpen(false);
                        start(false);
                    }}
                    onCancel={() => setIsConfirmOpen(false)}
                />
            )}
        </section>
    );
}

function Cell({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' | 'red' }) {
    const color =
        tone === 'green' ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'amber' ? 'text-amber-600 dark:text-amber-400'
                : tone === 'red' ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-800 dark:text-slate-100';

    return (
        <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className={`text-sm font-semibold tabular-nums ${color}`}>{value.toLocaleString('tr-TR')}</dd>
        </div>
    );
}
