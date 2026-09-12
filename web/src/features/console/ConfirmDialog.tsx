import { useState } from 'react';

/**
 * Prod onayı.
 *
 * WPF'te bu bir "Are you sure?" MessageBox'ıydı. Telefonda yanlış dokunma riski masaüstünden
 * yüksek olduğu için onay, işlenecek paket aralığının elle yazılmasını istiyor — okumadan
 * geçilebilen bir onay, onay değildir.
 */

interface Props {
    title: string;
    summary: string[];
    /** Kullanıcının birebir yazması gereken metin (paket aralığı). */
    requiredText: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/** Yalnız açıkken render edilir; her açılışta yeniden kurulduğu için yazılan metin kendiliğinden sıfırlanır. */
export function ConfirmDialog({ title, summary, requiredText, onConfirm, onCancel }: Props) {
    const [typed, setTyped] = useState('');

    const isMatch = typed.trim() === requiredText;

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    onCancel();
                }
            }}
        >
            <div className="w-full max-w-md rounded-2xl border border-red-300 bg-white p-5 shadow-xl dark:border-red-900 dark:bg-slate-900">
                <h2 className="text-base font-bold text-red-700 dark:text-red-300">{title}</h2>

                <ul className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    {summary.map((line) => (
                        <li key={line} className="font-mono text-xs break-all">
                            {line}
                        </li>
                    ))}
                </ul>

                <label htmlFor="confirmText" className="mt-4 block text-sm text-slate-700 dark:text-slate-300">
                    Onaylamak için <span className="font-mono font-bold">{requiredText}</span> yazın:
                </label>

                <input
                    id="confirmText"
                    autoFocus
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && isMatch) {
                            onConfirm();
                        }
                    }}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-red-950"
                />

                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        Vazgeç
                    </button>
                    <button
                        type="button"
                        disabled={!isMatch}
                        onClick={onConfirm}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Çalıştır
                    </button>
                </div>
            </div>
        </div>
    );
}
