import { getDbtDatNamesList } from '../api/masterClient';
import type { PackTarget } from './types';

/**
 * Start/End kutularını işlenecek veritabanı hedeflerine çevirir.
 *
 * Kurallar WPF sürümüyle birebir — sessiz kurallar olduğu için burada tek yerde ve açıkça duruyor:
 *  - Start boş veya sayı değil → boş liste (çağıran uyarır)
 *  - Start = 0 → tek hedef Dbt_Temp (sunucu packNo 0'ı Dbt_Temp'e çevirir)
 *  - End boş/geçersiz → Start ile BAŞLAYAN paketler (prefix modu). Önce yüklü ad listesine bakar,
 *    yoksa get-dbtdatnames ile sunucudan çeker; böylece End yazmamak hata vermez.
 *  - End dolu → Start..End aralığı (ad listesi yüklüyse var olmayan paketler atlanır)
 *  - Prefix modunda yalnız 6 haneli sayısal paket numaraları alınır.
 */
export async function resolvePackTargets(
    apiBaseUrl: string,
    startText: string,
    endText: string,
    datNames: string[] | null,
    signal?: AbortSignal,
): Promise<PackTarget[]> {
    const targets: PackTarget[] = [];

    const start = Number.parseInt((startText ?? '').trim(), 10);

    if (!Number.isInteger(start)) {
        return targets;
    }

    if (start === 0) {
        targets.push({ packNo: '0', packNoEnding: '', displayName: 'Dbt_Temp' });

        return targets;
    }

    const end = Number.parseInt((endText ?? '').trim(), 10);

    if (Number.isInteger(end) && end >= start) {
        for (let i = start; i <= end; i += 1) {
            if (datNames && datNames.length > 0 && !datNames.includes(`Dbt_${i}`)) {
                continue;
            }

            targets.push({ packNo: String(i), packNoEnding: '', displayName: `Dbt_${i}` });
        }

        return targets;
    }

    let prefixMatches = datNames ? datNames.filter((d) => d.startsWith(`Dbt_${start}`)) : [];

    if (prefixMatches.length === 0) {
        prefixMatches = await getDbtDatNamesList(apiBaseUrl, String(start), signal);
    }

    for (const datName of [...prefixMatches].sort()) {
        const packNo = datName.replace('Dbt_', '');

        if (packNo.length === 6 && /^\d{6}$/.test(packNo)) {
            targets.push({ packNo, packNoEnding: '', displayName: datName });
        }
    }

    return targets;
}

/**
 * Aralık modu işaretliyse hedef listesinden tek bir aralık hedefi üretir (ilk ve son paket no).
 * Mod kapalıysa, hedef tek ise (ör. Dbt_Temp) ya da paket numarası çözülemiyorsa null döner —
 * o durumda paket başına iş açan normal akış kullanılır.
 */
export function getRangeTarget(targets: PackTarget[], isBetweenMode: boolean): PackTarget | null {
    if (!isBetweenMode || targets.length < 2) {
        return null;
    }

    const packNos = targets
        .map((d) => Number.parseInt(d.packNo, 10))
        .filter((d) => Number.isInteger(d) && d > 0)
        .sort((a, b) => a - b);

    if (packNos.length === 0) {
        return null;
    }

    const first = packNos[0];
    const last = packNos[packNos.length - 1];

    return {
        packNo: String(first),
        packNoEnding: String(last),
        displayName: `Dbt_${first} - Dbt_${last} (aralık, ${targets.length} db)`,
    };
}
