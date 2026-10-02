import { useMemo, useRef, useState } from 'react';
import { buildStamp } from '../../buildInfo';
import { endpoints } from '../../api/endpoints';
import { getDbtDatNames, getDbtMigrations, tryReadStringList } from '../../api/masterClient';
import { useAuth } from '../../auth/useAuth';
import { isBlockedByMixedContent } from '../../config/environments';
import {
    OPERATIONS,
    OPERATION_KINDS,
    runOperation,
    validateRequest,
    type OperationKind,
    type OperationRequest,
} from '../../operations/adminOperations';
import {
    formatMigrationLabel,
    groupDbtMigrationNames,
    type DbtMigrationGroups,
} from '../../operations/dbtMigrationNames';
import { OperationLog } from '../../operations/operationLog';
import { ConfirmDialog } from './ConfirmDialog';
import { CounterBar } from './CounterBar';
import { Field, Label, checkboxClass, inputClass, secondaryButtonClass, selectClass } from './formControls';
import { LogPane } from './LogPane';
import { useOperationLog } from './useOperationLog';

export function ConsolePage() {
    const { environment } = useAuth();

    const log = useMemo(() => new OperationLog(), []);
    const snapshot = useOperationLog(log);

    const [kind, setKind] = useState<OperationKind>(OPERATION_KINDS.dbtMigrate);
    const [startText, setStartText] = useState('');
    const [endText, setEndText] = useState('');
    const [isBetweenMode, setIsBetweenMode] = useState(false);

    const [datNames, setDatNames] = useState<string[] | null>(null);
    const [dbtMigrations, setDbtMigrations] = useState<DbtMigrationGroups | null>(null);
    const [dbtMigrationName, setDbtMigrationName] = useState('');

    const [functionName, setFunctionName] = useState('');
    const [docStartDate, setDocStartDate] = useState('');
    const [docEndDate, setDocEndDate] = useState('');
    const [onlyMissing, setOnlyMissing] = useState(true);

    const [isRunning, setIsRunning] = useState(false);
    const [isHelperBusy, setIsHelperBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const abortRef = useRef<AbortController | null>(null);

    const selected = OPERATIONS.find((d) => d.kind === kind);
    const isMixedContentBlocked = isBlockedByMixedContent(environment);

    // Hangi alanın hangi işlemde anlamı var. Görünmeyen bir alanın değeri yine gönderilmez;
    // doğrulama da işleme göre çalışır (bkz. validateRequest).
    const usesRange = kind !== OPERATION_KINDS.migrationHistory && kind !== OPERATION_KINDS.migrationTracking;
    const usesBetweenMode = kind === OPERATION_KINDS.migrate || kind === OPERATION_KINDS.dbtMigrate;
    const usesMigrationName = kind === OPERATION_KINDS.dbtMigrate || kind === OPERATION_KINDS.migrationTracking;
    const usesFunctionName = kind === OPERATION_KINDS.functionRenew;
    const usesDocDates = kind === OPERATION_KINDS.updateSalerId;
    const usesOnlyMissing = kind === OPERATION_KINDS.migrationTracking;

    const migrationCount = dbtMigrations ? dbtMigrations.versioned.length + dbtMigrations.standalone.length : 0;

    const startHint =
        kind === OPERATION_KINDS.migrationHistory
            ? 'tam paket no (0 = Dbt_Temp)'
            : kind === OPERATION_KINDS.migrationTracking
              ? 'paket ön eki (0 = Dbt_Temp)'
              : '0 = Dbt_Temp';

    const confirmRange = endText.trim() && usesRange ? `${startText.trim()}-${endText.trim()}` : startText.trim();

    async function loadDatNames() {
        if (!startText.trim()) {
            setFormError('Önce Start kutusuna paket ön ekini yazın.');

            return;
        }

        setIsHelperBusy(true);
        setFormError('');
        log.reset();
        log.setOperation(`Db adları - ${endpoints.dbtDatNames(environment.apiBaseUrl, startText.trim())}`);

        const result = await getDbtDatNames(environment.apiBaseUrl, startText.trim());
        const names = result.isSuccess ? tryReadStringList(result.content) : null;

        if (!names || names.length === 0) {
            log.addLine('datNames not reading !..');
            log.addError(result.error || `Status Code: ${result.status}`);
            log.setStatus('Db adları okunamadı', 'failed');
            log.flushNow();
            setIsHelperBusy(false);

            return;
        }

        const sorted = [...names].sort();
        const min = sorted[0];
        const max = sorted[sorted.length - 1];

        setDatNames(names);
        setStartText(min.replace('Dbt_', ''));
        setEndText(max.replace('Dbt_', ''));

        log.addLine('DatNames ok');
        log.addLine(` Min : ${min}`);
        log.addLine(` Max : ${max}`);
        log.addLine(`Count : ${names.length}`);
        log.setStatus(`Db adları okundu - ${names.length} adet`, 'succeeded');
        log.flushNow();

        setIsHelperBusy(false);
    }

    async function loadDbtMigrations() {
        setIsHelperBusy(true);
        setFormError('');
        log.reset();
        log.setOperation(`Dbt migration adları - ${endpoints.dbtMigrations(environment.apiBaseUrl)}`);

        const result = await getDbtMigrations(environment.apiBaseUrl);
        const names = result.isSuccess ? tryReadStringList(result.content) : null;

        if (!names || names.length === 0) {
            log.addLine('dbt migrations not reading !..');
            log.addError(result.error || `Status Code: ${result.status}`);
            log.setStatus('Dbt migration adları okunamadı', 'failed');
            log.flushNow();
            setIsHelperBusy(false);

            return;
        }

        const groups = groupDbtMigrationNames(names);

        setDbtMigrations(groups);
        // En güncel SÜRÜM migration'ı hazır seçili gelsin; bağımsız işlemler (AllFunctions gibi)
        // kronolojik değildir, kendiliğinden seçilmemeli.
        setDbtMigrationName(groups.latest);

        log.addLine(`Dbt migrations ok - ${names.length} adet`);
        log.addLine(`Sürüm migration'ı : ${groups.versioned.length}`);
        log.addLine(`Bağımsız işlem    : ${groups.standalone.length}`);
        log.addLine(`En güncel sürüm   : ${groups.latest || '(yok)'}`);
        log.setStatus(`Dbt migration adları okundu - ${names.length} adet`, 'succeeded');
        log.flushNow();

        setIsHelperBusy(false);
    }

    function buildRequest(signal: AbortSignal): OperationRequest {
        return {
            apiBaseUrl: environment.apiBaseUrl,
            log,
            operationName: selected?.name ?? '',
            startText,
            endText: usesRange ? endText : '',
            datNames,
            isBetweenMode: usesBetweenMode && isBetweenMode,
            dbtMigrationName,
            functionName,
            docStartDate,
            docEndDate,
            onlyMissing,
            signal,
        };
    }

    function handleRunClick() {
        const validationError = validateRequest(kind, buildRequest(new AbortController().signal));

        if (validationError) {
            setFormError(validationError);

            return;
        }

        setFormError('');

        // Salt okuma işlemlerinde onay istenmez — yoksa onay refleks hâline gelir ve
        // gerçekten tehlikeli işlemde de düşünmeden onaylanır.
        if (environment.requiresConfirmation && !selected?.isReadOnly) {
            setIsConfirmOpen(true);

            return;
        }

        void start();
    }

    async function start() {
        setIsConfirmOpen(false);

        const controller = new AbortController();

        abortRef.current = controller;
        setIsRunning(true);
        log.reset();

        try {
            await runOperation(kind, buildRequest(controller.signal));
        } finally {
            abortRef.current = null;
            setIsRunning(false);
        }
    }

    function handleStop() {
        abortRef.current?.abort();
    }

    return (
        <div className="safe-bottom safe-x mx-auto flex h-full max-w-6xl flex-col gap-4 pt-4 lg:flex-row">
            <div className="w-full shrink-0 space-y-4 lg:w-80 lg:overflow-y-auto">
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <Field>
                        <Label>İşlem</Label>
                        <select
                            value={kind}
                            disabled={isRunning}
                            onChange={(e) => setKind(Number(e.target.value) as OperationKind)}
                            className={selectClass}
                        >
                            {OPERATIONS.map((operation) => (
                                <option key={operation.kind} value={operation.kind}>
                                    {operation.name}
                                </option>
                            ))}
                        </select>
                        {selected && (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {selected.description}
                                {selected.isReadOnly && ' · salt okuma'}
                            </p>
                        )}
                    </Field>

                    <div className={usesRange ? 'grid grid-cols-2 gap-2' : ''}>
                        <Field>
                            <Label htmlFor="start">Start</Label>
                            <input
                                id="start"
                                inputMode="numeric"
                                value={startText}
                                disabled={isRunning}
                                onChange={(e) => setStartText(e.target.value)}
                                placeholder={startHint}
                                className={`${inputClass} font-mono`}
                            />
                        </Field>

                        {usesRange && (
                            <Field>
                                <Label htmlFor="end">End</Label>
                                <input
                                    id="end"
                                    inputMode="numeric"
                                    value={endText}
                                    disabled={isRunning}
                                    onChange={(e) => setEndText(e.target.value)}
                                    placeholder="boş = ön ek"
                                    className={`${inputClass} font-mono`}
                                />
                            </Field>
                        )}
                    </div>

                    {!usesRange && (
                        <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
                            Bu işlemde End kutusu kullanılmaz.
                        </p>
                    )}

                    {usesRange && (
                        <button
                            type="button"
                            onClick={loadDatNames}
                            disabled={isRunning || isHelperBusy}
                            className={secondaryButtonClass}
                        >
                            Db adlarını getir{datNames ? ` (${datNames.length})` : ''}
                        </button>
                    )}

                    {usesBetweenMode && (
                        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={isBetweenMode}
                                disabled={isRunning}
                                onChange={(e) => setIsBetweenMode(e.target.checked)}
                                className={checkboxClass}
                            />
                            <span>
                                Aralık modu
                                <span className="block text-xs text-slate-500 dark:text-slate-400">
                                    Paket başına iş yerine tüm aralık için tek sıralı iş. Ağır migration'larda
                                    kullanın.
                                </span>
                            </span>
                        </label>
                    )}

                    {usesMigrationName && (
                        <Field>
                            <Label htmlFor="migrationName">
                                Dbt Migrate Name
                                {migrationCount > 0 ? ` (${migrationCount})` : ' — önce listeyi getirin'}
                            </Label>
                            {/*
                                Serbest metin değil açılır liste: elle yazılan hatalı bir ad, binlerce
                                veritabanında boşa koşan iş üretir ve değerin zaten sunucu listesinde
                                olması gerekir.

                                İki grup ayrı: sürüm migration'larının kronolojik sırası vardır
                                (yeniden eskiye), bağımsız bakım işlemlerinin yoktur.
                            */}
                            <select
                                id="migrationName"
                                value={dbtMigrationName}
                                disabled={isRunning || migrationCount === 0}
                                onChange={(e) => setDbtMigrationName(e.target.value)}
                                className={`${selectClass} font-mono text-xs`}
                            >
                                <option value="">—</option>
                                {dbtMigrations && dbtMigrations.versioned.length > 0 && (
                                    <optgroup label="Sürüm migration'ları (yeniden eskiye)">
                                        {dbtMigrations.versioned.map((name) => (
                                            <option key={name} value={name}>
                                                {formatMigrationLabel(name)}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                {dbtMigrations && dbtMigrations.standalone.length > 0 && (
                                    <optgroup label="Bağımsız işlemler">
                                        {dbtMigrations.standalone.map((name) => (
                                            <option key={name} value={name}>
                                                {name}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                            <button
                                type="button"
                                onClick={loadDbtMigrations}
                                disabled={isRunning || isHelperBusy}
                                className={`mt-2 ${secondaryButtonClass}`}
                            >
                                Dbt migration listesini getir
                            </button>
                        </Field>
                    )}

                    {usesFunctionName && (
                        <Field>
                            <Label htmlFor="functionName">Function Name</Label>
                            {/*
                                Serbest metin, bilerek: master/get-res-functions hem Test hem Prod'da boş
                                dizi dönüyor. Açılır listeye çevirmek bu işlemi kullanılamaz hâle getirirdi.
                            */}
                            <input
                                id="functionName"
                                value={functionName}
                                disabled={isRunning}
                                onChange={(e) => setFunctionName(e.target.value)}
                                placeholder="örn. SetCardTotalFunctions"
                                className={`${inputClass} font-mono text-xs`}
                            />
                        </Field>
                    )}

                    {usesDocDates && (
                        <div className="grid grid-cols-2 gap-2">
                            <Field>
                                <Label htmlFor="docStart">Evrak başlangıç</Label>
                                {/*
                                    type="date" bilerek: değer her zaman yyyy-MM-dd üretir. Sunucu tarafında
                                    DateTime.Parse(orderStartDate) kültüre bağlı çalışıyor; "01.09.2026" gibi
                                    yerel biçim gönderilirse ay/gün karışabilir ya da parse hatası alınır.
                                */}
                                <input
                                    id="docStart"
                                    type="date"
                                    value={docStartDate}
                                    disabled={isRunning}
                                    onChange={(e) => setDocStartDate(e.target.value)}
                                    className={inputClass}
                                />
                            </Field>
                            <Field>
                                <Label htmlFor="docEnd">Evrak bitiş</Label>
                                <input
                                    id="docEnd"
                                    type="date"
                                    value={docEndDate}
                                    disabled={isRunning}
                                    onChange={(e) => setDocEndDate(e.target.value)}
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                    )}

                    {usesOnlyMissing && (
                        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={onlyMissing}
                                disabled={isRunning}
                                onChange={(e) => setOnlyMissing(e.target.checked)}
                                className={checkboxClass}
                            />
                            <span>
                                Yalnız eksik/hatalı paketler
                                <span className="block text-xs text-slate-500 dark:text-slate-400">
                                    Kapalıysa taranan tüm paketler listelenir.
                                </span>
                            </span>
                        </label>
                    )}

                    {isMixedContentBlocked && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            Konsol https, servis http — tarayıcı bu çağrıları engelleyecek.
                        </p>
                    )}

                    {formError && (
                        <p
                            role="alert"
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                        >
                            {formError}
                        </p>
                    )}

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleRunClick}
                            disabled={isRunning || isHelperBusy}
                            className={[
                                'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50',
                                environment.requiresConfirmation && !selected?.isReadOnly
                                    ? 'bg-red-600 hover:bg-red-500'
                                    : 'bg-sky-600 hover:bg-sky-500',
                            ].join(' ')}
                        >
                            Çalıştır
                        </button>
                        <button
                            type="button"
                            onClick={handleStop}
                            disabled={!isRunning}
                            title="Yalnız yeni iş kuyruğa almayı durdurur; sunucuda koşan işler iptal edilmez."
                            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            Durdur
                        </button>
                    </div>

                    {isRunning && !selected?.isReadOnly && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            "Durdur" yalnız yeni iş kuyruğa almayı durdurur; sunucuda koşan işler iptal edilmez,
                            izleme onlar bitene kadar sürer.
                        </p>
                    )}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <CounterBar
                        counters={snapshot.counters}
                        state={snapshot.state}
                        statusText={snapshot.statusText}
                        variant={selected?.isReadOnly ? 'report' : 'queue'}
                    />
                </section>

                <p className="pb-2 text-center font-mono text-[11px] text-slate-400 dark:text-slate-600">
                    {buildStamp()}
                </p>
            </div>

            <LogPane
                lines={snapshot.lines}
                errors={snapshot.errors}
                operation={snapshot.operation}
                isRunning={isRunning}
            />

            {isConfirmOpen && (
                <ConfirmDialog
                    title="Prod ortamında işlem başlatılacak"
                    summary={[
                        `İşlem : ${selected?.name ?? ''}`,
                        `Paket : ${confirmRange}${isBetweenMode && usesBetweenMode ? ' (aralık modu)' : ''}`,
                        ...(usesMigrationName ? [`Migration : ${dbtMigrationName}`] : []),
                        ...(usesFunctionName ? [`Fonksiyon : ${functionName}`] : []),
                        ...(usesDocDates ? [`Evrak : ${docStartDate} → ${docEndDate}`] : []),
                        `Servis : ${environment.apiBaseUrl}`,
                    ]}
                    requiredText={confirmRange}
                    onConfirm={() => void start()}
                    onCancel={() => setIsConfirmOpen(false)}
                />
            )}
        </div>
    );
}
