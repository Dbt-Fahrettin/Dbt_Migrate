/**
 * Sunucudan gelen Dbt migration adlarını iki aileye ayırır.
 *
 * Ad listesi iki farklı şey içeriyor:
 *
 *  1. **Sürüm migration'ları (Path A)** — `20260904080939_Sep26_04_1` gibi, 14 haneli zaman
 *     damgasıyla başlayanlar. Bunlar bir EF migration'ına bağlıdır ve kronolojik sırası vardır.
 *  2. **Bağımsız işlemler (Path B)** — `AllFunctions`, `ModelIndexes`, `MigrationHistoryInit` gibi,
 *     tekrar tekrar koşturulabilen bakım migration'ları. Kronolojik sırası yoktur.
 *
 * Ayrım önemli: listeyi düz alfabetik sıralayıp "sonuncusu en günceldir" demek yanlış sonuç verir —
 * harfle başlayan bağımsız adlar rakamla başlayanlardan sonra gelir, yani "en güncel" olarak
 * `SempVoucherSettingsRekey` seçilir. Yanlış migration'ı binlerce veritabanında koşturmak,
 * bu araçta yapılabilecek en pahalı hatalardan biri.
 */

const TIMESTAMPED = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_(.+)$/;

export interface DbtMigrationGroups {
    /** Zaman damgalı migration'lar, yeniden eskiye. */
    versioned: string[];

    /** Bağımsız bakım migration'ları, alfabetik. */
    standalone: string[];

    /** En güncel sürüm migration'ı; hiç yoksa boş. */
    latest: string;
}

export function groupDbtMigrationNames(names: string[]): DbtMigrationGroups {
    const versioned = names
        .filter((d) => TIMESTAMPED.test(d))
        .sort()
        .reverse();
    const standalone = names.filter((d) => !TIMESTAMPED.test(d)).sort();

    return { versioned, standalone, latest: versioned[0] ?? '' };
}

/** Listede gösterilecek etiket: zaman damgalı adlarda tarih okunur hale getirilir. */
export function formatMigrationLabel(name: string): string {
    const match = TIMESTAMPED.exec(name);

    if (!match) {
        return name;
    }

    const [, year, month, day, hour, minute, , rest] = match;

    return `${rest} · ${day}.${month}.${year} ${hour}:${minute}`;
}
