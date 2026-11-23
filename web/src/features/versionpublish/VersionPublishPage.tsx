import { useState } from 'react';
import type { ReactNode } from 'react';
import { describeSaveFailure, saveVersion } from '../../api/versionPublish';
import { describeError } from '../../api/http';
import { fullName } from '../../auth/types';
import { useAuth } from '../../auth/useAuth';
import { ConfirmDialog } from '../console/ConfirmDialog';
import {
    PRG_KIND,
    PRG_KIND_LABELS,
    PRG_VERS_LABELS,
    UPDATE_TARGET_LABELS,
    buildPayload,
    defaultExeName,
    newForm,
    nextItemId,
    packTypesFor,
    summaryLines,
    validateForm,
    versionIntFrom,
} from './versionPublishModel';
import type { PrgKindValue, PrgVersValue, UpdateTarget, VersionForm, VersionItem } from './versionPublishModel';

/**
 * Versiyon Ekleme: Devatek.Admin "Versiyon Bilgileri" ekranının (devatek.online/version-info) karşılığı.
 * Yeni sürüm kaydını seçili ortamın Login.Api'sine yazar (`admin/save-version`); kayıt bütün istemcilerin güncelleme
 * kararını belirlediği için Prod'da ve zorunlu sürümde onay için sürüm metni yazdırılır.
 */

const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const baseBtn = 'rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40';
const secondaryBtn = `${baseBtn} border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`;
const dangerBtn = `${baseBtn} border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950`;
const primaryBtn = `${baseBtn} border-sky-600 bg-sky-600 text-white hover:bg-sky-700`;

export function VersionPublishPage() {
    const { environment, user } = useAuth();

    const [form, setForm] = useState<VersionForm>(() => newForm());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [editing, setEditing] = useState<VersionItem | null>(null);

    function patch(changes: Partial<VersionForm>): void {
        setForm((cur) => ({ ...cur, ...changes }));
        setDone('');
    }

    function changeVns(vns: string): void {
        const vni = versionIntFrom(vns);

        patch({ vns, vni: vni === null ? form.vni : String(vni) });
    }

    function changeKind(kind: PrgKindValue): void {
        patch({ prgKind: kind, setupExe: defaultExeName(kind), updateExe: defaultExeName(kind) });
    }

    function saveItem(): void {
        if (!editing) {
            return;
        }

        const exists = form.items.some((i) => i.id === editing.id);

        patch({ items: exists ? form.items.map((i) => (i.id === editing.id ? editing : i)) : [editing, ...form.items] });
        setEditing(null);
    }

    function start(): void {
        const errors = validateForm(form);

        if (errors.length > 0) {
            setError(errors.join(' '));

            return;
        }

        setError('');

        if (form.prgKind === PRG_KIND.prod || form.mandatory) {
            setConfirming(true);

            return;
        }

        void publish();
    }

    async function publish(): Promise<void> {
        setConfirming(false);
        setBusy(true);
        setError('');

        try {
            const actor = { id: user?.id ?? '', name: user ? fullName(user) : '' };
            const payload = buildPayload(form, actor, crypto.randomUUID());
            const result = await saveVersion(environment.loginApiBaseUrl, user?.lat, payload);
            const failure = describeSaveFailure(result);

            if (failure) {
                setError(failure);

                return;
            }

            setDone(`${form.vns.trim()} (${PRG_VERS_LABELS[form.prgVers]} / ${PRG_KIND_LABELS[form.prgKind]}) kaydedildi.`);
            setForm(newForm());
        } catch (caught) {
            setError(describeError(caught));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="safe-x safe-bottom mx-auto max-w-4xl pt-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Yeni sürüm kaydı ekler; istemciler güncelleme bilgisini bu kayıttan okur. Devatek.Admin "Versiyon" ekranıyla aynı
                kayıt yazılır.
            </p>

            <p className="mt-3 text-sm">
                <span className="rounded bg-amber-100 px-2 py-1 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Yazılacak ortam: {environment.name}
                </span>
                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{environment.loginApiBaseUrl}</span>
            </p>

            {error && (
                <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {error}
                </p>
            )}

            {done && (
                <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                    {done}
                </p>
            )}

            <Section title="Sürüm">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Versiyon metni (yyaa.gg.n)">
                        <input className={inputCls} value={form.vns} onChange={(e) => changeVns(e.target.value)} />
                    </Field>
                    <Field label="Versiyon sayısı (8 hane)">
                        <input className={inputCls} value={form.vni} onChange={(e) => patch({ vni: e.target.value })} inputMode="numeric" />
                    </Field>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    <Toggle label="Zorunlu" checked={form.mandatory} onChange={(v) => patch({ mandatory: v })} tone="text-orange-600 dark:text-orange-400" />
                    <Toggle label="e-Dönüşüm" checked={form.forEtr} onChange={(v) => patch({ forEtr: v })} tone="text-sky-600 dark:text-sky-400" />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field label="Program">
                        <select className={inputCls} value={form.prgVers} onChange={(e) => patch({ prgVers: Number(e.target.value) as PrgVersValue })}>
                            {(Object.keys(PRG_VERS_LABELS) as unknown as PrgVersValue[]).map((k) => (
                                <option key={k} value={k}>
                                    {PRG_VERS_LABELS[k]}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Yayın türü">
                        <select className={inputCls} value={form.prgKind} onChange={(e) => changeKind(Number(e.target.value) as PrgKindValue)}>
                            {(Object.keys(PRG_KIND_LABELS) as unknown as PrgKindValue[]).map((k) => (
                                <option key={k} value={k}>
                                    {PRG_KIND_LABELS[k]}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Hedef paketler">
                        <select className={inputCls} value={form.target} onChange={(e) => patch({ target: e.target.value as UpdateTarget })}>
                            {(Object.keys(UPDATE_TARGET_LABELS) as UpdateTarget[]).map((k) => (
                                <option key={k} value={k}>
                                    {UPDATE_TARGET_LABELS[k]}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Paket tipleri: {packTypesFor(form.target) || 'hepsi (boş)'}
                </p>
            </Section>

            <Section title="Adresler">
                <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Kurulum adresi" className="sm:col-span-2">
                        <input className={inputCls} value={form.setupUrl} onChange={(e) => patch({ setupUrl: e.target.value })} />
                    </Field>
                    <Field label="Kurulum dosyası">
                        <input className={inputCls} value={form.setupExe} onChange={(e) => patch({ setupExe: e.target.value })} />
                    </Field>
                    <Field label="Güncelleme adresi" className="sm:col-span-2">
                        <input className={inputCls} value={form.updateUrl} onChange={(e) => patch({ updateUrl: e.target.value })} />
                    </Field>
                    <Field label="Güncelleme dosyası">
                        <input className={inputCls} value={form.updateExe} onChange={(e) => patch({ updateExe: e.target.value })} />
                    </Field>
                </div>
                <div className="mt-3">
                    <Field label="Paket numaraları (boşsa hepsi; 6 haneli, ; , ya da boşlukla)">
                        <input className={inputCls} value={form.packNos} onChange={(e) => patch({ packNos: e.target.value })} placeholder="500025;500070" />
                    </Field>
                </div>
            </Section>

            <Section title={`Sürüm notları (${form.items.length})`}>
                <button type="button" className={secondaryBtn} disabled={!!editing} onClick={() => setEditing({ id: nextItemId(form.items), modul: '', description: '' })}>
                    Ekle
                </button>

                {editing && (
                    <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">
                        <Field label="Modül">
                            <input className={inputCls} value={editing.modul} onChange={(e) => setEditing({ ...editing, modul: e.target.value })} autoFocus />
                        </Field>
                        <Field label="Açıklama" className="sm:col-span-2">
                            <input className={inputCls} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                        </Field>
                        <div className="flex gap-2 sm:col-span-3">
                            <button type="button" className={primaryBtn} disabled={!editing.modul.trim() || !editing.description.trim()} onClick={saveItem}>
                                Tamam
                            </button>
                            <button type="button" className={secondaryBtn} onClick={() => setEditing(null)}>
                                İptal
                            </button>
                        </div>
                    </div>
                )}

                <ul className="mt-3 space-y-2">
                    {form.items.map((item) => (
                        <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.modul}</p>
                                <p className="text-xs break-words text-slate-600 dark:text-slate-300">{item.description}</p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <button type="button" className={secondaryBtn} disabled={!!editing} onClick={() => setEditing(item)}>
                                    Düzenle
                                </button>
                                <button type="button" className={dangerBtn} disabled={!!editing} onClick={() => patch({ items: form.items.filter((i) => i.id !== item.id) })}>
                                    Sil
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </Section>

            <div className="mt-4 flex justify-end">
                <button type="button" className={primaryBtn} disabled={busy || !!editing} onClick={start}>
                    {busy ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
            </div>

            {confirming && (
                <ConfirmDialog
                    title={`${environment.name}: sürüm kaydedilsin mi?`}
                    summary={summaryLines(form, environment.name)}
                    requiredText={form.vns.trim()}
                    onConfirm={() => void publish()}
                    onCancel={() => setConfirming(false)}
                />
            )}
        </div>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            {children}
        </section>
    );
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
    return (
        <label className={`block text-xs text-slate-600 dark:text-slate-300 ${className}`}>
            <span className="mb-1 block">{label}</span>
            {children}
        </label>
    );
}

function Toggle({ label, checked, onChange, tone }: { label: string; checked: boolean; onChange: (v: boolean) => void; tone: string }) {
    return (
        <label className={`flex items-center gap-2 text-sm font-medium ${tone}`}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            {label}: {checked ? 'Evet' : 'Hayır'}
        </label>
    );
}
