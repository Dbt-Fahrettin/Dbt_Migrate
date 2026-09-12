import type { OperationCounters, OperationState } from '../../operations/types';

const STATE_STYLE: Record<OperationState, { dot: string; label: string }> = {
    ready: { dot: 'bg-slate-400', label: 'Hazır' },
    running: { dot: 'bg-sky-500 animate-pulse', label: 'Çalışıyor' },
    succeeded: { dot: 'bg-emerald-500', label: 'Tamamlandı' },
    failed: { dot: 'bg-amber-500', label: 'Hatalı bitti' },
};

/**
 * Sayaçların anlamı işleme göre değişir:
 * - `queue`: kuyruğa iş atan işlemler (0, 1, 2, 6)
 * - `report`: salt okuma raporları (7, 8) — kuyruk/bekleyen kavramı yok
 */
export type CounterVariant = 'queue' | 'report';

interface Props {
    counters: OperationCounters;
    state: OperationState;
    statusText: string;
    variant: CounterVariant;
}

function Counter({ label, value, tone }: { label: string; value: number; tone: string }) {
    return (
        <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {label}
            </div>
            <div className={`text-lg font-bold tabular-nums ${tone}`}>{value}</div>
        </div>
    );
}

export function CounterBar({ counters, state, statusText, variant }: Props) {
    const style = STATE_STYLE[state];

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {statusText || style.label}
                </span>
            </div>

            {variant === 'report' ? (
                <div className="grid grid-cols-3 gap-2">
                    <Counter label="Kayıt" value={counters.queued} tone="text-slate-800 dark:text-slate-100" />
                    <Counter
                        label="Uygulanmış"
                        value={counters.success}
                        tone="text-emerald-600 dark:text-emerald-400"
                    />
                    <Counter label="Eksik / Hatalı" value={counters.error} tone="text-red-600 dark:text-red-400" />
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    <Counter
                        label="Kuyruğa alınan"
                        value={counters.queued}
                        tone="text-slate-800 dark:text-slate-100"
                    />
                    <Counter
                        label="Başarılı"
                        value={counters.success}
                        tone="text-emerald-600 dark:text-emerald-400"
                    />
                    <Counter label="Hatalı" value={counters.error} tone="text-red-600 dark:text-red-400" />
                    <Counter label="Atlanan" value={counters.skipped} tone="text-amber-600 dark:text-amber-400" />
                    <Counter label="Bekleyen" value={counters.pending} tone="text-sky-600 dark:text-sky-400" />
                </div>
            )}
        </div>
    );
}
