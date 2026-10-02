import { useState } from 'react';
import type { PackRequeryRequest, PackRequeryUnitResult } from '../../api/gibRequery';
import { gibEndpoints } from '../../api/endpoints';
import { useAuth } from '../../auth/useAuth';
import { formatDate } from '../../format';
import { ConfirmDialog } from '../console/ConfirmDialog';
import { Field, Label, inputClass } from '../console/formControls';
import { useRequeryRun } from './useRequeryRun';
import { validateRequeryForm, type RequeryForm } from './requeryForm';

/**
 * Paket yeniden sorgusu — `GibInvoiceQuery/RequeryPackInvoices`.
 *
 * Uzun iş: sunucu bütçesi dolunca kaldığı yeri imleçle döner, istemci bitene kadar çağrıyı
 * tekrarlar (bkz. useRequeryRun). İlerleme bu yüzden gerçek zamanlı izlenebiliyor.
 */
export function PackRequeryPanel() {
    const { environment, user } = useAuth();

    const token = user?.lat ?? '';
    const run = useRequeryRun(environment.gibApiBaseUrl, token);

    const [form, setForm] = useState<RequeryForm>({
        packNo: '',
        startDate: '',
        endDate: '',
        taxNumberOrIdn: '',
        chunkDays: '7',
        budgetSeconds: '60',
    });

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [formError, setFormError] = useState('');
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const isRunning = run.state === 'running';

    function update<K extends keyof RequeryForm>(key: K, value: RequeryForm[K]) {
        setForm((previous) => ({ ...previous, [key]: value }));
    }

    function buildRequest(): PackRequeryRequest {
        return {
            packNo: Number.parseInt(form.packNo.trim(), 10),
            startDate: form.startDate,
            endDate: form.endDate || undefined,
            taxNumberOrIdn: form.taxNumberOrIdn.trim() || undefined,
            chunkDays: Number.parseInt(form.chunkDays, 10),
            budgetSeconds: Number.parseInt(form.budgetSeconds, 10),
        };
    }

    function handleRunClick() {
        const validationError = validateRequeryForm(form);

        if (validationError) {
            setFormError(validationError);

            return;
        }

        setFormError('');

        // Bir çağrı paketin BÜTÜN mükellefleri adına GİB'e onlarca istek atıyor; Prod'da sorulur.
        if (environment.requiresConfirmation) {
            setIsConfirmOpen(true);

            return;
        }

        run.start(buildRequest());
    }

    function confirmRun() {
        setIsConfirmOpen(false);
        run.start(buildRequest());
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Paket Yeniden Sorgu</h2>
            <p className="mt-1 font-mono text-[11px] break-all text-slate-500 dark:text-slate-400">
                {gibEndpoints.requeryPackInvoices(environment.gibApiBaseUrl)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Paketin mükelleflerini verilen tarihten itibaren gece sorgusundan bağımsız yeniden sorgular.
                İçeriği zaten alınmış faturalar atlanır; yeni gelen ya da içeriği alınamamış olanların içeriği
                güncel kurallarla istenir. <strong>Damga yazmaz</strong>, yani gece turunun ilerleyişini etkilemez.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Field>
                    <Label htmlFor="requeryPackNo">Paket no</Label>
                    <input
                        id="requeryPackNo"
                        inputMode="numeric"
                        value={form.packNo}
                        disabled={isRunning}
                        onChange={(e) => update('packNo', e.target.value)}
                        placeholder="örn. 500292"
                        className={`${inputClass} font-mono`}
                    />
                </Field>

                <Field>
                    <Label htmlFor="requeryStart">Başlangıç tarihi</Label>
                    <input
                        id="requeryStart"
                        type="date"
                        value={form.startDate}
                        disabled={isRunning}
                        onChange={(e) => update('startDate', e.target.value)}
                        className={inputClass}
                    />
                </Field>

                <Field>
                    <Label htmlFor="requeryEnd">Bitiş tarihi</Label>
                    <input
                        id="requeryEnd"
                        type="date"
                        value={form.endDate}
                        disabled={isRunning}
                        onChange={(e) => update('endDate', e.target.value)}
                        className={inputClass}
                    />
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        Boş = verisi hazır en yeni gün
                    </p>
                </Field>
            </div>

            <button
                type="button"
                onClick={() => setShowAdvanced((d) => !d)}
                className="mt-3 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
            >
                {showAdvanced ? 'Gelişmiş ayarları gizle' : 'Gelişmiş ayarlar'}
            </button>

            {showAdvanced && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field>
                        <Label htmlFor="requeryTaxNumber">Mükellef VKN / TCKN</Label>
                        <input
                            id="requeryTaxNumber"
                            inputMode="numeric"
                            value={form.taxNumberOrIdn}
                            disabled={isRunning}
                            onChange={(e) => update('taxNumberOrIdn', e.target.value)}
                            placeholder="boş = paketin tamamı"
                            className={`${inputClass} font-mono`}
                        />
                    </Field>

                    <Field>
                        <Label htmlFor="requeryChunk">Parça gün (1-31)</Label>
                        <input
                            id="requeryChunk"
                            inputMode="numeric"
                            value={form.chunkDays}
                            disabled={isRunning}
                            onChange={(e) => update('chunkDays', e.target.value)}
                            className={`${inputClass} font-mono`}
                        />
                        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            Bir GİB çağrısının kapsadığı gün
                        </p>
                    </Field>

                    <Field>
                        <Label htmlFor="requeryBudget">Çağrı bütçesi sn (30-480)</Label>
                        <input
                            id="requeryBudget"
                            inputMode="numeric"
                            value={form.budgetSeconds}
                            disabled={isRunning}
                            onChange={(e) => update('budgetSeconds', e.target.value)}
                            className={`${inputClass} font-mono`}
                        />
                        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            Küçük değer = daha sık ilerleme
                        </p>
                    </Field>
                </div>
            )}

            {formError && (
                <p
                    role="alert"
                    className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                >
                    {formError}
                </p>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                    type="button"
                    onClick={handleRunClick}
                    disabled={isRunning}
                    className={[
                        'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50',
                        environment.requiresConfirmation
                            ? 'bg-red-600 hover:bg-red-500'
                            : 'bg-sky-600 hover:bg-sky-500',
                    ].join(' ')}
                >
                    {isRunning ? 'Çalışıyor…' : 'Çalıştır'}
                </button>

                <button
                    type="button"
                    onClick={run.stop}
                    disabled={!isRunning}
                    title="Koşan çağrı bütçesini tamamlar; yeni çağrı açılmaz."
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Durdur
                </button>

                {run.progress && !isRunning && (
                    <button
                        type="button"
                        onClick={run.reset}
                        className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        Temizle
                    </button>
                )}
            </div>

            {run.error && (
                <p
                    role="alert"
                    className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                >
                    {run.error}
                </p>
            )}

            {run.progress && <ProgressPanel run={run} />}

            {isConfirmOpen && (
                <ConfirmDialog
                    title="Prod: paket yeniden sorgulanacak"
                    summary={[
                        `Paket : ${form.packNo}`,
                        `Tarih : ${form.startDate} → ${form.endDate || 'en yeni hazır gün'}`,
                        form.taxNumberOrIdn.trim()
                            ? `Mükellef : ${form.taxNumberOrIdn.trim()}`
                            : 'Paketin BÜTÜN mükellefleri sorgulanacak.',
                        'Bu iş paket adına GİB’e çok sayıda istek atar; dakikalar sürebilir.',
                    ]}
                    requiredText={form.packNo.trim()}
                    onConfirm={confirmRun}
                    onCancel={() => setIsConfirmOpen(false)}
                />
            )}
        </section>
    );
}

const STATE_LABEL: Record<string, { text: string; tone: string }> = {
    running: { text: 'Çalışıyor', tone: 'bg-sky-500 animate-pulse' },
    done: { text: 'Tamamlandı', tone: 'bg-emerald-500' },
    stopped: { text: 'Durduruldu', tone: 'bg-amber-500' },
    failed: { text: 'Hatalı bitti', tone: 'bg-red-500' },
    idle: { text: 'Hazır', tone: 'bg-slate-400' },
};

function ProgressPanel({ run }: { run: ReturnType<typeof useRequeryRun> }) {
    const progress = run.progress;

    if (!progress) {
        return null;
    }

    const percent =
        progress.totalUnits > 0
            ? Math.min(100, Math.round((progress.processedUnits / progress.totalUnits) * 100))
            : 0;

    const status = STATE_LABEL[run.state] ?? STATE_LABEL.idle;

    return (
        <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.tone}`} />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{status.text}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                    · {progress.processedUnits}/{progress.totalUnits || '?'} birim
                    {progress.totalUnits > 0 && ` (%${percent})`}
                </span>
            </div>

            <div
                className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className={`h-full rounded-full transition-all ${
                        run.state === 'failed' ? 'bg-red-500' : 'bg-sky-500'
                    }`}
                    style={{ width: `${percent}%` }}
                />
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Cell label="Mükellef" value={String(progress.taxPayerCount)} />
                <Cell label="Fatura" value={String(progress.invoiceCount)} />
                <Cell label="Önbellekten" value={String(progress.fromCacheCount)} />
                <Cell label="Yeni içerik" value={String(progress.newContentCount)} />
                <Cell label="İçeriksiz" value={String(progress.withoutContentCount)} tone="amber" />
                <Cell label="Hatalı birim" value={String(progress.errorUnits)} tone="red" />
                <Cell label="Çağrı" value={String(progress.callCount)} />
                <Cell label="Süre" value={`${Math.round(progress.elapsedSeconds)} sn`} />
            </dl>

            {progress.message && <p className="text-xs text-slate-500 dark:text-slate-400">{progress.message}</p>}

            {progress.skippedTaxPayers.length > 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Atlanan mükellef ({progress.skippedTaxPayers.length}):{' '}
                    <span className="font-mono">{progress.skippedTaxPayers.join(', ')}</span>
                </p>
            )}

            {progress.units.length > 0 && <UnitLog units={progress.units} />}
        </div>
    );
}

function UnitLog({ units }: { units: PackRequeryUnitResult[] }) {
    return (
        <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {units
                    .slice()
                    .reverse()
                    .map((unit, index) => (
                        <li
                            key={`${unit.taxPayer}-${unit.kind}-${unit.startDate}-${index}`}
                            className={`px-3 py-1.5 font-mono text-[11px] ${
                                unit.isOk
                                    ? 'text-slate-600 dark:text-slate-300'
                                    : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                            }`}
                        >
                            <span className="font-semibold">{unit.taxPayer}</span> · {unit.kind} ·{' '}
                            {formatDate(unit.startDate)}–{formatDate(unit.endDate)} → fatura {unit.invoiceCount}{' '}
                            (önbellek {unit.fromCacheCount}, yeni {unit.newContentCount}, içeriksiz{' '}
                            {unit.withoutContentCount}) · {unit.elapsedSeconds.toFixed(1)} sn
                            {unit.message ? ` · ${unit.message}` : ''}
                        </li>
                    ))}
            </ul>
        </div>
    );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'red' }) {
    const valueTone =
        tone === 'red'
            ? 'text-red-600 dark:text-red-400'
            : tone === 'amber'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-800 dark:text-slate-100';

    return (
        <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {label}
            </dt>
            <dd className={`text-sm font-semibold tabular-nums ${valueTone}`}>{value}</dd>
        </div>
    );
}
