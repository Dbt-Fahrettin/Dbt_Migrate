import type { ReactNode } from 'react';

/**
 * Form kontrollerinin ortak sınıfları. Aynı uzun className dizisini altı ayrı alanda
 * tekrarlamamak için tek yerde.
 */

export const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900' +
    ' outline-none focus:border-slate-500 disabled:opacity-60' +
    ' dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

export const selectClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900' +
    ' disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

export const secondaryButtonClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700' +
    ' transition hover:bg-slate-100 disabled:opacity-50' +
    ' dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

export const checkboxClass = 'mt-0.5';

export function Field({ children }: { children: ReactNode }) {
    return <div>{children}</div>;
}

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
    return (
        <label
            htmlFor={htmlFor}
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
            {children}
        </label>
    );
}
