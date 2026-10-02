/** Ortak biçimlendirme yardımcıları. */

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * `null`/boş sayılan tarihler.
 *
 * Sunucu "henüz değer yok" durumunu `DateTime.MinValue` ile döndürüyor (`0001-01-01T00:00:00`) —
 * örneğin gece sorgusu hiç koşmamışsa `activeQueryDate` böyle gelir. Bunu olduğu gibi yazmak
 * ekranda anlamsız bir tarih gösterir; boş kabul edip çağıranın "-" basmasına bırakıyoruz.
 */
function parse(value: string | null | undefined): Date | null {
    if (!value) {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime()) || date.getFullYear() < 1900) {
        return null;
    }

    return date;
}

/** `2026-09-07T10:23:45Z` → `07.09.2026 10:23:45`; okunamıyorsa boş. */
export function formatDateTime(value: string | null | undefined): string {
    const date = parse(value);

    if (!date) {
        return '';
    }

    return (
        `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}` +
        ` ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
    );
}

/** `2026-09-13T00:00:00` → `13.09.2026`; okunamıyorsa boş. */
export function formatDate(value: string | null | undefined): string {
    const date = parse(value);

    if (!date) {
        return '';
    }

    return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}
