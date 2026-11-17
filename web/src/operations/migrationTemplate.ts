/**
 * Migration şablonu: sırayla çalışan adımlar.
 *
 * Neden gerekiyor: yayın günü hep aynı sıra elle tekrarlanıyordu — önce Dbt_Temp, sonra 123'lü test
 * paketleri, sonra canlı 50xxxx; her grupta önce Migration, ardından ModelIndexes. Her adım ayrı bir
 * işlem, aralarında beklemek ve bir öncekinin başarısını gözle kontrol etmek gerekiyordu. Şablon bu
 * sırayı bir kez tanımlar ve tek tıkla yürütür.
 *
 * Şablon yeni bir işlem türü DEĞİL: her adım mevcut "0-Migrate" ya da "1-Dbt-Migrate" işleminin
 * aynı girdileridir (Start/End, aralık modu, eşzamanlı db, kullanım önceliği, migration adı). Yani bir
 * adımın davranışı ekrandan elle çalıştırmakla birebir aynıdır; şablonun eklediği tek şey sıra ve
 * hata durumunda ne yapılacağıdır.
 */

export type TemplateStepKind = 'migrate' | 'dbtMigrate';

/** Adım hata verirse: sonraki adımlar çalışmasın mı, sürsün mü. */
export type StepErrorPolicy = 'stop' | 'continue';

export interface TemplateStep {
    id: string;
    kind: TemplateStepKind;

    /** Start kutusu: 0 = Dbt_Temp, "123" = 123 ile başlayanlar (End boşsa önek), ya da aralığın başı. */
    start: string;

    /** End kutusu; boşsa Start bir önektir. */
    end: string;

    /** Aralık modu: paket başına iş yerine tek iş. */
    isRange: boolean;

    /** Aralık modunda aynı anda işlenecek veritabanı (1-5). */
    parallel: number;

    /** Aralık modunda kullanıma göre sırala (sık ve sabah erken kullanılanlar önce). */
    orderByUsage: boolean;

    /** Yalnız dbtMigrate: Dbt migration adı (ör. ModelIndexes). */
    migrationName: string;

    onError: StepErrorPolicy;
}

export interface MigrationTemplate {
    id: string;
    name: string;

    /** Yerleşik şablon silinemez ve değiştirilemez; "kopya olarak kaydet" ile özelleştirilir. */
    isBuiltIn: boolean;

    steps: TemplateStep[];
}

export const MAX_PARALLEL = 5;

export const KIND_LABELS: Record<TemplateStepKind, string> = {
    migrate: '0-Migrate',
    dbtMigrate: '1-Dbt-Migrate',
};

function newId(): string {
    const random = globalThis.crypto?.randomUUID?.();

    return random ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Varsayılanlı yeni adım. Hata politikası varsayılan DUR: bir adım düşerse sonraki çalışmasın. */
export function newStep(patch: Partial<Omit<TemplateStep, 'id'>> = {}): TemplateStep {
    return {
        id: newId(),
        kind: 'migrate',
        start: '',
        end: '',
        isRange: false,
        parallel: 1,
        orderByUsage: false,
        migrationName: '',
        onError: 'stop',
        ...patch,
    };
}

/**
 * Adımın kapsadığı hedefin okunur hali: "Dbt_Temp", "123*" (önek), "500000 - 504997".
 */
export function describeTarget(step: TemplateStep): string {
    const start = step.start.trim();
    const end = step.end.trim();

    if (start === '0') {
        return 'Dbt_Temp';
    }

    if (!end) {
        return `${start}*`;
    }

    return `${start} - ${end}`;
}

/** Tek satırlık özet: "1-Dbt-Migrate ModelIndexes · 50* · aralık, 3 eşzamanlı, kullanım önceliği". */
export function describeStep(step: TemplateStep): string {
    const name =
        step.kind === 'dbtMigrate' && step.migrationName.trim()
            ? `${KIND_LABELS[step.kind]} ${step.migrationName.trim()}`
            : KIND_LABELS[step.kind];

    const parts: string[] = [name, describeTarget(step)];

    if (step.isRange) {
        const mode: string[] = ['aralık'];

        if (step.parallel > 1) {
            mode.push(`${step.parallel} eşzamanlı`);
        }

        if (step.orderByUsage) {
            mode.push('kullanım önceliği');
        }

        parts.push(mode.join(', '));
    } else {
        parts.push('paket başına');
    }

    return parts.join(' · ');
}

/** Adım geçerliyse boş dize, değilse nedeni. */
export function validateStep(step: TemplateStep): string {
    const start = step.start.trim();
    const end = step.end.trim();

    if (!/^\d+$/.test(start)) {
        return 'Start sayı olmalı (0 = Dbt_Temp, 123 = önek, 500000 = aralık başı).';
    }

    if (end && !/^\d+$/.test(end)) {
        return 'End boş ya da sayı olmalı.';
    }

    if (end && Number.parseInt(end, 10) < Number.parseInt(start, 10)) {
        return 'End, Start’tan küçük olamaz.';
    }

    if (step.kind === 'dbtMigrate' && !step.migrationName.trim()) {
        return 'Dbt migration adı boş olamaz (ör. ModelIndexes).';
    }

    if (!Number.isInteger(step.parallel) || step.parallel < 1 || step.parallel > MAX_PARALLEL) {
        return `Eşzamanlı db 1 ile ${MAX_PARALLEL} arasında olmalı.`;
    }

    // Dbt_Temp tek veritabanıdır: aralık ve öncelik anlamsız, kullanıcıyı yanlış beklentiye sokar.
    if (start === '0' && (step.isRange || step.orderByUsage || step.parallel > 1)) {
        return 'Dbt_Temp tek veritabanıdır: aralık, eşzamanlılık ve öncelik kullanılamaz.';
    }

    if (step.orderByUsage && !step.isRange) {
        return 'Kullanım önceliği yalnız aralık modunda çalışır.';
    }

    if (step.parallel > 1 && !step.isRange) {
        return 'Eşzamanlı db yalnız aralık modunda çalışır.';
    }

    return '';
}

/** Şablon geçerliyse boş dize, değilse ilk hata ("Adım 3: …"). */
export function validateTemplate(template: MigrationTemplate): string {
    if (!template.name.trim()) {
        return 'Şablon adı boş olamaz.';
    }

    if (template.steps.length === 0) {
        return 'Şablonda en az bir adım olmalı.';
    }

    for (let i = 0; i < template.steps.length; i += 1) {
        const problem = validateStep(template.steps[i]);

        if (problem) {
            return `Adım ${i + 1}: ${problem}`;
        }
    }

    return '';
}

/**
 * Prod onayında gösterilen özet: her adım numaralı, neyin hangi sırayla çalışacağı eksiksiz görünür.
 */
export function confirmLines(template: MigrationTemplate): string[] {
    const lines = [`Şablon : ${template.name}`, `${template.steps.length} adım, sırayla:`];

    template.steps.forEach((step, index) => {
        const suffix = step.onError === 'stop' ? '' : ' (hata olsa da devam)';

        lines.push(`${index + 1}. ${describeStep(step)}${suffix}`);
    });

    return lines;
}

/**
 * Yerleşik şablon: standart yayın sırası.
 *
 * Dbt_Temp → 123'lü test paketleri → canlı 50xxxx; her grupta ÖNCE Migration, SONRA ModelIndexes.
 * Sıra bilerek böyle: ModelIndexes, tabloları ve kolonları olan paketleri varsayar; migration'ı
 * düşmüş bir pakette indeks kurmaya kalkmak ya hata verir ya da yarım şemaya indeks bırakır. Bu
 * yüzden her adımın varsayılan hata politikası DUR.
 *
 * Canlı 50xxxx adımları aralık modunda, 3 eşzamanlı ve kullanım önceliğiyle: orta yoğunluk
 * (kuyruk şişmez, müşteriler yavaşlamaz) ve sık / erken kullanılan paketler önce hazır olur.
 * Eşzamanlılık kullanıcıya göre değişir; yerleşik şablon kopyalanıp ayarlanabilir.
 */
export const BUILT_IN_TEMPLATES: MigrationTemplate[] = [
    {
        id: 'builtin-standard',
        name: 'Standart sıra: Temp → 123 → 50xxxx',
        isBuiltIn: true,
        steps: [
            newStepStable('b1', { kind: 'migrate', start: '0' }),
            newStepStable('b2', { kind: 'dbtMigrate', start: '0', migrationName: 'ModelIndexes' }),
            newStepStable('b3', { kind: 'migrate', start: '123' }),
            newStepStable('b4', { kind: 'dbtMigrate', start: '123', migrationName: 'ModelIndexes' }),
            newStepStable('b5', { kind: 'migrate', start: '50', isRange: true, parallel: 3, orderByUsage: true }),
            newStepStable('b6', {
                kind: 'dbtMigrate',
                start: '50',
                migrationName: 'ModelIndexes',
                isRange: true,
                parallel: 3,
                orderByUsage: true,
            }),
        ],
    },
];

/** Yerleşik adımların kimliği sabit olmalı: her açılışta yeni üretilirse "değişti" sanılır. */
function newStepStable(id: string, patch: Partial<Omit<TemplateStep, 'id'>>): TemplateStep {
    return { ...newStep(patch), id };
}

/**
 * Saklanmış / içe alınmış bir değeri şablona çevirir; biçim tutmazsa null.
 *
 * Depo kullanıcının tarayıcısında ve elle düzenlenebilir: bozuk bir kayıt ekranı çökertmemeli,
 * yalnız o şablon yok sayılmalı.
 */
export function parseTemplate(raw: unknown): MigrationTemplate | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }

    const source = raw as Record<string, unknown>;

    if (typeof source.id !== 'string' || typeof source.name !== 'string' || !Array.isArray(source.steps)) {
        return null;
    }

    const steps: TemplateStep[] = [];

    for (const item of source.steps) {
        const step = parseStep(item);

        if (!step) {
            return null;
        }

        steps.push(step);
    }

    return { id: source.id, name: source.name, isBuiltIn: false, steps };
}

function parseStep(raw: unknown): TemplateStep | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }

    const source = raw as Record<string, unknown>;

    const kind = source.kind === 'migrate' || source.kind === 'dbtMigrate' ? source.kind : null;
    const onError = source.onError === 'continue' ? 'continue' : 'stop';

    if (!kind || typeof source.start !== 'string') {
        return null;
    }

    return {
        id: typeof source.id === 'string' ? source.id : newId(),
        kind,
        start: source.start,
        end: typeof source.end === 'string' ? source.end : '',
        isRange: source.isRange === true,
        parallel: typeof source.parallel === 'number' ? source.parallel : 1,
        orderByUsage: source.orderByUsage === true,
        migrationName: typeof source.migrationName === 'string' ? source.migrationName : '',
        onError,
    };
}
