/**
 * Versiyon ekleme ekranının saf kuralları (ekran ve testler ortak kullanır).
 *
 * Kaynak: Devatek.Admin `Pages/Admin/VersionInfo.razor.cs` (devatek.online/version-info). Varsayılanlar, hedef paket tipleri
 * ve kayıt biçimi orayla birebir aynı tutulur; sunucu `admin/save-version` (Login.Api `AdminController`) tek yazma noktasıdır.
 */

/** `PrgVersEnum`. */
export const PRG_VERS = { wpf: 0, mobile: 1, web: 2 } as const;
/** `PrgKindEnum` (Test = 0, Prod = 3). */
export const PRG_KIND = { test: 0, prod: 3 } as const;

export type PrgVersValue = (typeof PRG_VERS)[keyof typeof PRG_VERS];
export type PrgKindValue = (typeof PRG_KIND)[keyof typeof PRG_KIND];

export const PRG_VERS_LABELS: Record<PrgVersValue, string> = { 0: 'WPF', 1: 'Mobil', 2: 'Web' };
export const PRG_KIND_LABELS: Record<PrgKindValue, string> = { 0: 'Test', 3: 'Prod' };

/** `UpdateTargetEnum` yerine ekranda seçilen hedef. */
export type UpdateTarget = 'all' | 'prime' | 'commerce' | 'manufacturing';

export const UPDATE_TARGET_LABELS: Record<UpdateTarget, string> = {
    all: 'Hepsi',
    prime: 'Prime',
    commerce: 'Elite (Ticari)',
    manufacturing: 'Suit (Üretim)',
};

/**
 * Hedefe göre paket tipleri (`PackTypeEnum` değerleri, ';' ile). Boş = hepsi.
 * Sahadaki WPF istemcileri alanı koşulsuz okuduğu için "hepsi" NULL değil boş metindir.
 */
export function packTypesFor(target: UpdateTarget): string {
    switch (target) {
        case 'prime':
            return '100;50;90';
        case 'commerce':
            return '10;20;30;40;50;60;70;80;90';
        case 'manufacturing':
            return '60;70;80;90';
        default:
            return '';
    }
}

/** Yayın türüne göre kurulum / güncelleme dosyası adı. */
export function defaultExeName(kind: PrgKindValue): string {
    return kind === PRG_KIND.prod ? 'Unideva_Setup.exe' : 'Unideva_Setup_T.exe';
}

export const DEFAULT_DOWNLOAD_URL = 'https://indir.unideva.com';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Bugünün sürüm metni: 23.11.2026 → `2611.23.1`. */
export function versionStringFor(date: Date): string {
    return `${pad2(date.getFullYear() % 100)}${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}.1`;
}

/**
 * Sürüm metninden sayı: `2611.23.1` → 26112301 (yyaagg + iki haneli sıra). Biçim tutmazsa null.
 * Sunucu istemcileri bu sayıyla karşılaştırır; metinle sayı birbirinden kopmasın diye ekran birini diğerinden üretir.
 */
export function versionIntFrom(vns: string): number | null {
    const match = /^(\d{4})\.(\d{2})\.(\d{1,2})$/.exec(vns.trim());

    if (!match) {
        return null;
    }

    return Number(`${match[1]}${match[2]}${pad2(Number(match[3]))}`);
}

export interface VersionItem {
    id: number;
    modul: string;
    description: string;
}

export interface VersionForm {
    vns: string;
    vni: string;
    mandatory: boolean;
    forEtr: boolean;
    prgVers: PrgVersValue;
    prgKind: PrgKindValue;
    target: UpdateTarget;
    setupUrl: string;
    setupExe: string;
    updateUrl: string;
    updateExe: string;
    packNos: string;
    items: VersionItem[];
}

export function newForm(now: Date = new Date()): VersionForm {
    const vns = versionStringFor(now);

    return {
        vns,
        vni: String(versionIntFrom(vns) ?? ''),
        mandatory: false,
        forEtr: false,
        prgVers: PRG_VERS.wpf,
        prgKind: PRG_KIND.test,
        target: 'all',
        setupUrl: DEFAULT_DOWNLOAD_URL,
        setupExe: defaultExeName(PRG_KIND.test),
        updateUrl: DEFAULT_DOWNLOAD_URL,
        updateExe: defaultExeName(PRG_KIND.test),
        packNos: '',
        items: [],
    };
}

/** Paket numaralarını ';' ile birleştirir; geçersiz parça ayrıca döner (sessizce atlanmaz). */
export function normalizePackNos(text: string): { value: string; invalid: string[] } {
    const packs: string[] = [];
    const invalid: string[] = [];

    for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
        if (/^\d{6}$/.test(part)) {
            if (!packs.includes(part)) {
                packs.push(part);
            }
        } else {
            invalid.push(part.length > 20 ? `${part.slice(0, 20)}…` : part);
        }
    }

    return { value: packs.join(';'), invalid };
}

/** Kaydetmeden önce engelleyen hatalar; boşsa kaydedilebilir. */
export function validateForm(form: VersionForm): string[] {
    const errors: string[] = [];
    const vni = Number(form.vni);

    if (versionIntFrom(form.vns) === null) {
        errors.push('Versiyon metni "yyaa.gg.n" biçiminde olmalı (örn. 2611.23.1).');
    }

    if (!/^\d{8}$/.test(form.vni.trim()) || !Number.isInteger(vni)) {
        errors.push('Versiyon sayısı 8 haneli olmalı (örn. 26112301).');
    }

    if (!form.setupUrl.trim() || !form.setupExe.trim()) {
        errors.push('Kurulum adresi ve dosya adı boş olamaz.');
    }

    if (!form.updateUrl.trim() || !form.updateExe.trim()) {
        errors.push('Güncelleme adresi ve dosya adı boş olamaz.');
    }

    const packs = normalizePackNos(form.packNos);

    if (packs.invalid.length > 0) {
        errors.push(`Geçersiz paket numarası: ${packs.invalid.slice(0, 5).join(', ')} (6 haneli olmalı).`);
    }

    if (form.items.some((i) => !i.modul.trim() || !i.description.trim())) {
        errors.push('Sürüm notlarında modül ve açıklama boş bırakılamaz.');
    }

    return errors;
}

/** Yeni satır numarası: mevcut en büyüğün bir fazlası (WPF ile aynı kural). */
export function nextItemId(items: VersionItem[]): number {
    return items.length === 0 ? 1 : Math.max(...items.map((i) => i.id)) + 1;
}

export interface Actor {
    id: string;
    name: string;
}

/** `admin/save-version` gövdesi (`DbtVersion`). */
export interface DbtVersionPayload {
    id: string;
    prgVers: number;
    prgKind: number;
    vni: number;
    vns: string;
    setu: string;
    setx: string;
    upu: string;
    upx: string;
    ism: boolean;
    forEtr: boolean;
    xnf: string;
    packTypes: string;
    packNos: string;
    creatorId: string;
    creatorName: string;
    createdAt: string;
    modifierId: string;
    modifierName: string;
    modifiedAt: string;
    updateCount: number;
}

export function buildPayload(form: VersionForm, actor: Actor, id: string, now: Date = new Date()): DbtVersionPayload {
    const at = now.toISOString();
    // Sürüm notları WPF'in okuduğu biçimde (PascalCase, satır numarasına göre sıralı) saklanır.
    const notes = [...form.items]
        .sort((a, b) => a.id - b.id)
        .map((i) => ({ Id: i.id, Modul: i.modul.trim(), Description: i.description.trim() }));

    return {
        id,
        prgVers: form.prgVers,
        prgKind: form.prgKind,
        vni: Number(form.vni),
        vns: form.vns.trim(),
        setu: form.setupUrl.trim(),
        setx: form.setupExe.trim(),
        upu: form.updateUrl.trim(),
        upx: form.updateExe.trim(),
        ism: form.mandatory,
        forEtr: form.forEtr,
        xnf: JSON.stringify(notes),
        packTypes: packTypesFor(form.target),
        packNos: normalizePackNos(form.packNos).value,
        creatorId: actor.id,
        creatorName: actor.name,
        createdAt: at,
        modifierId: actor.id,
        modifierName: actor.name,
        modifiedAt: at,
        updateCount: 1,
    };
}

/** Onay penceresinin özet satırları. */
export function summaryLines(form: VersionForm, env: string): string[] {
    const packs = normalizePackNos(form.packNos).value;

    return [
        `Ortam: ${env}`,
        `Sürüm: ${form.vns.trim()} (${form.vni.trim()}) — ${PRG_VERS_LABELS[form.prgVers]} / ${PRG_KIND_LABELS[form.prgKind]}`,
        `Hedef: ${UPDATE_TARGET_LABELS[form.target]}${packs ? ` · paketler: ${packs}` : ' · tüm paketler'}`,
        form.mandatory ? 'ZORUNLU güncelleme: kullanıcılar bu sürüme geçmeden giremez.' : 'Zorunlu değil.',
    ];
}
