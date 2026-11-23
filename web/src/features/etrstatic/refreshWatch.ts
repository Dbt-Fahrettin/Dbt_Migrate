import type { RefreshStatus } from '../../api/etrStatic';

/**
 * Liste yenileme izleme mantığı (arayüzden ayrı, test edilebilir).
 *
 * Servisin iş durumu pod belleğinde tutulur. Servis birden çok kopyada koşuyorsa durum isteği işi
 * başlatan kopyaya denk gelmeyebilir: o kopya "çalışmıyor, hiç çalışmadı" der. Bunu "bitti" sanmak
 * yanlış olurdu; üst üste birkaç kez böyle görülürse izleme bırakılır ve kullanıcıya söylenir.
 */

export type WatchOutcome =
    | { kind: 'finished'; status: RefreshStatus }
    | { kind: 'lost' }
    | { kind: 'aborted' };

/** Üst üste kaç "hiç çalışmadı" yanıtından sonra izleme bırakılır. */
export const LOST_AFTER = 3;

export function isFinished(status: RefreshStatus): boolean {
    return !status.running && status.finishedUtc !== null;
}

/** İş bu kopyada hiç görünmüyor: çalışmıyor ve bitiş de yok. */
export function isUnseen(status: RefreshStatus): boolean {
    return !status.running && status.finishedUtc === null;
}

export async function watchRefresh(
    read: () => Promise<RefreshStatus | null>,
    onUpdate: (status: RefreshStatus) => void,
    wait: (ms: number) => Promise<void>,
    isAborted: () => boolean,
    intervalMs = 5000,
): Promise<WatchOutcome> {
    let unseen = 0;

    while (!isAborted()) {
        const status = await read();

        if (status) {
            onUpdate(status);

            if (isFinished(status)) {
                return { kind: 'finished', status };
            }

            unseen = isUnseen(status) ? unseen + 1 : 0;

            if (unseen >= LOST_AFTER) {
                return { kind: 'lost' };
            }
        }

        await wait(intervalMs);
    }

    return { kind: 'aborted' };
}

/**
 * Sonuç iletisinden kayıt sayısı: liste 1 "<sayı>:<anahtar>", liste 2 "pk list count: <sayı>".
 * Tanınmazsa null (ileti olduğu gibi gösterilir).
 */
export function parseRecordCount(message: string | null): number | null {
    if (!message) {
        return null;
    }

    const first = /^(\d+):/.exec(message.trim());
    const second = /count:\s*(\d+)/i.exec(message);
    const raw = first?.[1] ?? second?.[1];

    return raw === undefined ? null : Number.parseInt(raw, 10);
}

/** Geçen süre: "2 dk 05 sn". */
export function formatElapsed(fromMs: number, toMs: number): string {
    const total = Math.max(0, Math.floor((toMs - fromMs) / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, '0');

    return minutes > 0 ? `${minutes} dk ${seconds} sn` : `${total} sn`;
}
