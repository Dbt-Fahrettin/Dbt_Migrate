/**
 * Kullanıcı şablonlarının tarayıcıda saklanması (localStorage).
 * Depo erişilemezse (özel pencere, engelli) ekran yine açılır: yalnız yerleşik şablonlar görünür.
 */

import { BUILT_IN_TEMPLATES, parseTemplate } from './migrationTemplate';
import type { MigrationTemplate, TemplateEnvKey } from './migrationTemplate';

const STORAGE_KEY = 'dbt-admin.migration-templates.v1';

export function loadUserTemplates(): MigrationTemplate[] {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);

        if (!raw) {
            return [];
        }

        const parsed: unknown = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            return [];
        }

        // Bozuk kayıt yalnız kendisini düşürür, diğer şablonlar kalır.
        return parsed.map(parseTemplate).filter((d): d is MigrationTemplate => d !== null);
    } catch {
        return [];
    }
}

export function saveUserTemplates(templates: MigrationTemplate[]): void {
    try {
        const plain = templates.filter((d) => !d.isBuiltIn);

        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(plain));
    } catch {
        // Depo yazılamıyorsa şablon yalnız bu oturumda yaşar.
    }
}

export function allTemplates(user: MigrationTemplate[]): MigrationTemplate[] {
    return [...BUILT_IN_TEMPLATES, ...user];
}

/** Yerleşik şablondan (ya da başka şablondan) düzenlenebilir kopya. */
export function copyTemplate(source: MigrationTemplate, name: string, envKey?: TemplateEnvKey): MigrationTemplate {
    const id = globalThis.crypto?.randomUUID?.() ?? `t-${Date.now().toString(36)}`;

    return {
        id,
        name,
        isBuiltIn: false,
        envKey: envKey ?? source.envKey,
        steps: source.steps.map((d, index) => ({ ...d, id: `${id}-${index}` })),
    };
}
