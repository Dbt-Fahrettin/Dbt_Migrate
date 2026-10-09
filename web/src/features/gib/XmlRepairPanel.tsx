import { useCallback, useEffect, useRef, useState } from 'react';
import { gibEndpoints } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { ConfirmDialog } from '../console/ConfirmDialog';
import { downloadText, fileStamp } from './faultyUrlReport';
import { buildRepairCsv, runRepairLoop } from './xmlRepairLoop';
import type { RepairRunState, RepairTotals } from './xmlRepairLoop';

/**
 * Başka mükellefin satırına yazılmış XML'lerin onarımı — `GibInvoiceQuery/RepairCrossWrittenXml`.
 *
 * Önce **Prova** (hiçbir şey yazmaz): kaç satırın yanlış olduğu, kaç gerçek sahibin boş kaldığı listelenir.
 * **Onar** gerçek işlemi yapar: yanlış satırın XML'i boşaltılır ve kendi adresinden doğru XML yeniden alınır; belgenin
 * gerçek sahibinin boş satırı doldurulur. Her iki iş de imleçle parçalanır ve bitene kadar sürer.
 */
export function XmlRepairPanel() {
    const { environment, user } = useAuth();
    const token = user?.lat ?? '';

    const [state, setState] = useState<RepairRunState>('idle');
    const [totals, setTotals] = useState<RepairTotals | null>(null);
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

            void runRepairLoop({
                gibApiBaseUrl: environment.gibApiBaseUrl,
                token,
                dryRun,
                maxGroups: 40,
                shouldStop: () => stopRef.current,
                onProgress: (next) => mountedRef.current && setTotals(next),
                onError: (message) => mountedRef.current && setError(message),
            }).then((finalState) => mountedRef.current && setState(finalState));
        },
        [environment.gibApiBaseUrl, token],
    );

    function handleRepairClick() {
        // Onarım veri siler (yanlış XML'i boşaltır); her ortamda sorulur.
        setIsConfirmOpen(true);
    }

    function download() {
        if (!totals) {
            return;
        }

        downloadText(
            `gib-xml-onarim-${totals.dryRun ? 'prova' : 'onarim'}-${environment.key}-${fileStamp(new Date().toISOString())}.csv`,
            buildRepairCsv(totals),
            'text/csv;charset=utf-8',
        );
    }

    const isRunning = state === 'running';

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Yanlış Satıra Yazılmış XML Onarımı</h2>
            <p className="mt-1 font-mono text-[11px] break-all text-slate-500 dark:text-slate-400">
                {gibEndpoints.repairCrossWrittenXml(environment.gibApiBaseUrl, true, '', 40)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Eski faulty kurtarma yolu ETTN'siz kayıtta satırı yalnız fatura numarasıyla aradığı için XML aynı numaralı başka
                mükelleflerin satırına da yazılabiliyordu. Onarım, aynı XML'i aynı yönde birden çok firmada taşıyan her satırı
                XML'in kendisine göre sınar: sahibi olan satıra dokunulmaz; olmayanın XML'i boşaltılıp kendi adresinden doğru
                XML yeniden alınır, belgenin gerçek sahibinin boş satırı doldurulur. <strong>Önce Prova</strong> çalıştırın:
                hiçbir şey yazmaz.
            </p>

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
                    onClick={() => start(true)}
                    disabled={isRunning}
                    className="flex-1 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
                >
                    {isRunning && totals?.dryRun ? 'Prova sürüyor…' : 'Prova'}
                </button>
                <button
                    type="button"
                    onClick={handleRepairClick}
                    disabled={isRunning}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                    {isRunning && totals && !totals.dryRun ? 'Onarılıyor…' : 'Onar'}
                </button>
                <button
                    type="button"
                    onClick={() => (stopRef.current = true)}
                    disabled={!isRunning}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Durdur
                </button>
                <button
                    type="button"
                    onClick={download}
                    disabled={!totals || totals.rows.length === 0}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Liste (.csv)
                </button>
            </div>

            {totals && <Totals totals={totals} state={state} />}

            {isConfirmOpen && (
                <ConfirmDialog
                    title={`${environment.key}: yanlış satırlardaki XML onarılacak`}
                    summary={[
                        `Servis : ${environment.gibApiBaseUrl}`,
                        'Sahibi olmayan satırların XML\'i boşaltılır ve kendi adresinden yeniden alınır.',
                        'Belgenin gerçek sahibinin boş satırına XML yazılır.',
                        'Önce Prova sonucunu inceleyin.',
                    ]}
                    requiredText="ONAR"
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

const STATE_TEXT: Record<RepairRunState, string> = {
    idle: 'Hazır',
    running: 'Çalışıyor',
    done: 'Tamamlandı',
    stopped: 'Durduruldu',
    failed: 'Hatalı bitti',
};

function Totals({ totals, state }: { totals: RepairTotals; state: RepairRunState }) {
    const cells: [string, number, string?][] = totals.dryRun
        ? [
              ['XML grubu', totals.groupCount],
              ['Şüpheli satır', totals.rowCount],
              ['Sahibi (kalacak)', totals.ownerRows],
              ['Temizlenecek', totals.wrongRows, 'red'],
              ['Doğrulanamadı', totals.unverifiableRows, 'amber'],
              ['Sahibine yazılacak', totals.ownerFilledRows],
              ['Sahibi zaten kayıtlı', totals.ownerAlreadyStored],
              ['Sahibinin satırı yok', totals.ownerMissing, 'amber'],
          ]
        : [
              ['XML grubu', totals.groupCount],
              ['Şüpheli satır', totals.rowCount],
              ['Sahibi (kaldı)', totals.ownerRows],
              ['Temizlendi', totals.clearedRows, 'red'],
              ['Doğru XML yazıldı', totals.refetchedRows],
              ['Boş kaldı', totals.leftEmptyRows, 'amber'],
              ['Sahibine yazıldı', totals.ownerFilledRows],
              ['Sahibinin satırı yok', totals.ownerMissing, 'amber'],
          ];

    return (
        <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-300">
                <strong>{totals.dryRun ? 'Prova' : 'Onarım'}</strong> · {STATE_TEXT[state]} · {totals.callCount} çağrı ·{' '}
                {Math.round(totals.elapsedSeconds)} sn
            </p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {cells.map(([label, value, tone]) => (
                    <div key={label} className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {label}
                        </dt>
                        <dd
                            className={`text-sm font-semibold tabular-nums ${
                                tone === 'red'
                                    ? 'text-red-600 dark:text-red-400'
                                    : tone === 'amber'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-slate-800 dark:text-slate-100'
                            }`}
                        >
                            {value.toLocaleString('tr-TR')}
                        </dd>
                    </div>
                ))}
            </dl>
            {totals.rows.length > 0 && (
                <ul className="max-h-72 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 font-mono text-[11px] dark:divide-slate-800 dark:border-slate-800">
                    {totals.rows
                        .filter((row) => row.action !== 'Kaldı')
                        .slice(0, 300)
                        .map((row, index) => (
                            <li key={`${row.id}-${index}`} className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                                <span className="font-semibold">{row.action}</span> · {row.faturaNo}
                                {row.direction && ` · ${row.direction}`}
                                {row.packNo != null && ` · paket ${row.packNo}`} · {row.note}
                            </li>
                        ))}
                </ul>
            )}
        </div>
    );
}
