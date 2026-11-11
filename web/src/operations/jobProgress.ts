import type { JobProgress } from './types';

/**
 * Süren işin ilerleme hesapları.
 *
 * Neden gerekiyor: aralık modunda tek iş binlerce veritabanını sırayla geziyor ve yarım saat
 * sürebiliyor. Sunucu her veritabanından sonra ilerleme yazıyor ama konsol bunu yalnız tek satırlık
 * bir günlük metni olarak gösteriyordu; satır sanal listede kesildiği için "hangi veritabanındayız,
 * kaç tane kaldı, ne kadar sürer" görünmüyordu (11.11.2026).
 *
 * Süre istemcide ölçülüyor: iş ilk kez "Processing" görüldüğünde başlatılır. Sunucunun kendi
 * `Elapsed` değeri toplu durum yanıtında dönmüyor; onu da eklemek yerine istemcide ölçmek hem
 * sunucu yayını beklemiyor hem de kuyrukta bekleme süresini tahmine katmıyor.
 */

/** İş bitti sayılacak durumlar — bunlarda ilerleme paneli satırı düşer. */
export function isFinishedState(state: string): boolean {
    return state === 'Succeeded' || state === 'Failed' || state === 'Deleted';
}

/** İşlenen veritabanı sayısı. */
export function doneCount(job: JobProgress): number {
    return job.okCount + job.failCount + job.skippedCount;
}

/** Kalan; toplam bilinmiyorsa null. */
export function remainingCount(job: JobProgress): number | null {
    if (job.total <= 0) {
        return null;
    }

    return Math.max(0, job.total - doneCount(job));
}

/** Yüzde (0-100); toplam bilinmiyorsa null. */
export function percentDone(job: JobProgress): number | null {
    if (job.total <= 0) {
        return null;
    }

    return Math.min(100, Math.round((doneCount(job) / job.total) * 100));
}

/**
 * Tahmini kalan süre (ms).
 *
 * Hiç veritabanı bitmemişken tahmin üretilmez: tek örnekten yapılan tahmin yanıltıcı olur ve
 * ekranda "2 saat" gibi bir sayı görmek kullanıcıyı yanlış karara iter. Aynı sebeple toplam
 * bilinmiyorsa da null döner.
 */
export function estimatedRemainingMs(job: JobProgress): number | null {
    const done = doneCount(job);
    const remaining = remainingCount(job);

    if (done <= 0 || remaining === null || job.elapsedMs <= 0) {
        return null;
    }

    return Math.round((job.elapsedMs / done) * remaining);
}

/** `ss:dd:ss` — gün taşarsa saat alanı büyür (36:12:00 gibi). */
export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) {
        return '—';
    }

    const total = Math.floor(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return [hours, minutes, seconds].map((d) => String(d).padStart(2, '0')).join(':');
}

/** Kalan süreyi insan diliyle: "~12 dk", "~1 sa 20 dk", bir dakikanın altında "<1 dk". */
export function formatEta(ms: number | null): string {
    if (ms === null) {
        return 'hesaplanıyor…';
    }

    const minutes = Math.round(ms / 60000);

    if (minutes < 1) {
        return '<1 dk';
    }

    if (minutes < 60) {
        return `~${minutes} dk`;
    }

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    return rest === 0 ? `~${hours} sa` : `~${hours} sa ${rest} dk`;
}
