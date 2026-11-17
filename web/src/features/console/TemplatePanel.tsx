import { useState } from 'react';
import {
    KIND_LABELS,
    MAX_PARALLEL,
    describeStep,
    newStep,
    validateTemplate,
} from '../../operations/migrationTemplate';
import type { MigrationTemplate, TemplateStep } from '../../operations/migrationTemplate';
import { allTemplates, copyTemplate, loadUserTemplates, saveUserTemplates } from '../../operations/templateStore';
import { inputClass, secondaryButtonClass, selectClass } from './formControls';

interface Props {
    isRunning: boolean;
    requiresConfirmation: boolean;
    migrationNames: string[];
    onRun: (template: MigrationTemplate) => void;
}

const smallButton =
    'rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40' +
    ' dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

/**
 * Migration şablonları: sırayla çalışan adımlar (ör. Temp → 123 → 50xxxx; her grupta Migration sonra
 * ModelIndexes). Yerleşik şablon değiştirilemez; "Kopya" ile düzenlenebilir kopya açılır.
 */
export function TemplatePanel({ isRunning, requiresConfirmation, migrationNames, onRun }: Props) {
    const [userTemplates, setUserTemplates] = useState<MigrationTemplate[]>(() => loadUserTemplates());
    const templates = allTemplates(userTemplates);
    const [selectedId, setSelectedId] = useState(templates[0].id);
    const [error, setError] = useState('');

    const selected = templates.find((d) => d.id === selectedId) ?? templates[0];

    function commit(next: MigrationTemplate[]) {
        setUserTemplates(next);
        saveUserTemplates(next);
    }

    function updateSelected(patch: (template: MigrationTemplate) => MigrationTemplate) {
        commit(userTemplates.map((d) => (d.id === selected.id ? patch(d) : d)));
    }

    function updateStep(index: number, patch: Partial<TemplateStep>) {
        updateSelected((t) => ({ ...t, steps: t.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
    }

    function moveStep(index: number, delta: number) {
        updateSelected((t) => {
            const steps = [...t.steps];
            const target = index + delta;

            if (target < 0 || target >= steps.length) {
                return t;
            }

            [steps[index], steps[target]] = [steps[target], steps[index]];

            return { ...t, steps };
        });
    }

    function makeCopy() {
        const copy = copyTemplate(selected, `${selected.name} (kopya)`);

        commit([...userTemplates, copy]);
        setSelectedId(copy.id);
    }

    function removeSelected() {
        commit(userTemplates.filter((d) => d.id !== selected.id));
        setSelectedId(templates[0].id);
    }

    function run() {
        const problem = validateTemplate(selected);

        setError(problem);

        if (!problem) {
            onRun(selected);
        }
    }

    const editable = !selected.isBuiltIn && !isRunning;

    return (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Şablon
            </h2>

            <select
                value={selected.id}
                onChange={(e) => {
                    setSelectedId(e.target.value);
                    setError('');
                }}
                disabled={isRunning}
                className={selectClass}
            >
                {templates.map((d) => (
                    <option key={d.id} value={d.id}>
                        {d.name}
                        {d.isBuiltIn ? ' (yerleşik)' : ''}
                    </option>
                ))}
            </select>

            {selected.isBuiltIn && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Yerleşik şablon değiştirilemez; ayarlamak için “Kopya” açın.
                </p>
            )}

            {editable && (
                <input
                    value={selected.name}
                    onChange={(e) => updateSelected((t) => ({ ...t, name: e.target.value }))}
                    className={inputClass}
                    aria-label="Şablon adı"
                />
            )}

            <datalist id="template-migration-names">
                {migrationNames.map((name) => (
                    <option key={name} value={name} />
                ))}
            </datalist>

            <ol className="space-y-2">
                {selected.steps.map((step, index) =>
                    editable ? (
                        <li key={step.id} className="space-y-1 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                            <div className="grid grid-cols-2 gap-1">
                                <select
                                    value={step.kind}
                                    onChange={(e) => updateStep(index, { kind: e.target.value as TemplateStep['kind'] })}
                                    className={selectClass}
                                    aria-label="İşlem"
                                >
                                    <option value="migrate">{KIND_LABELS.migrate}</option>
                                    <option value="dbtMigrate">{KIND_LABELS.dbtMigrate}</option>
                                </select>
                                <input
                                    value={step.migrationName}
                                    disabled={step.kind !== 'dbtMigrate'}
                                    list="template-migration-names"
                                    onChange={(e) => updateStep(index, { migrationName: e.target.value })}
                                    placeholder="migration adı"
                                    className={`${inputClass} font-mono text-xs`}
                                />
                                <input
                                    value={step.start}
                                    onChange={(e) => updateStep(index, { start: e.target.value })}
                                    placeholder="Start (0, 123, 500000)"
                                    className={`${inputClass} font-mono`}
                                />
                                <input
                                    value={step.end}
                                    onChange={(e) => updateStep(index, { end: e.target.value })}
                                    placeholder="End (boş = önek)"
                                    className={`${inputClass} font-mono`}
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={step.isRange}
                                        onChange={(e) =>
                                            updateStep(
                                                index,
                                                e.target.checked
                                                    ? { isRange: true }
                                                    : { isRange: false, parallel: 1, orderByUsage: false },
                                            )
                                        }
                                    />
                                    aralık
                                </label>
                                <label className="flex items-center gap-1">
                                    eşzamanlı
                                    <input
                                        inputMode="numeric"
                                        value={step.parallel}
                                        disabled={!step.isRange}
                                        onChange={(e) =>
                                            updateStep(index, {
                                                parallel: Math.min(MAX_PARALLEL, Number.parseInt(e.target.value, 10) || 1),
                                            })
                                        }
                                        className="w-10 rounded border border-slate-300 bg-white px-1 py-0.5 text-center dark:border-slate-700 dark:bg-slate-950"
                                    />
                                </label>
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={step.orderByUsage}
                                        disabled={!step.isRange}
                                        onChange={(e) => updateStep(index, { orderByUsage: e.target.checked })}
                                    />
                                    kullanım önceliği
                                </label>
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={step.onError === 'continue'}
                                        onChange={(e) => updateStep(index, { onError: e.target.checked ? 'continue' : 'stop' })}
                                    />
                                    hatada devam et
                                </label>
                            </div>
                            <div className="flex gap-1">
                                <button type="button" className={smallButton} onClick={() => moveStep(index, -1)}>
                                    ↑
                                </button>
                                <button type="button" className={smallButton} onClick={() => moveStep(index, 1)}>
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    className={smallButton}
                                    onClick={() => updateSelected((t) => ({ ...t, steps: t.steps.filter((_, i) => i !== index) }))}
                                >
                                    Sil
                                </button>
                            </div>
                        </li>
                    ) : (
                        <li key={step.id} className="font-mono text-xs text-slate-700 dark:text-slate-300">
                            {index + 1}. {describeStep(step)}
                            {step.onError === 'continue' ? ' (hatada devam)' : ''}
                        </li>
                    ),
                )}
            </ol>

            {editable && (
                <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => updateSelected((t) => ({ ...t, steps: [...t.steps, newStep({ start: '0' })] }))}
                >
                    Adım ekle
                </button>
            )}

            {error && (
                <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                    {error}
                </p>
            )}

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={run}
                    disabled={isRunning}
                    className={[
                        'flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50',
                        requiresConfirmation ? 'bg-red-600 hover:bg-red-500' : 'bg-sky-600 hover:bg-sky-500',
                    ].join(' ')}
                >
                    Şablonu çalıştır
                </button>
                <button type="button" className={smallButton} onClick={makeCopy} disabled={isRunning}>
                    Kopya
                </button>
                {!selected.isBuiltIn && (
                    <button type="button" className={smallButton} onClick={removeSelected} disabled={isRunning}>
                        Sil
                    </button>
                )}
            </div>
        </section>
    );
}
