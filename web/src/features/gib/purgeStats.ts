import type { XmlPurgeControl, XmlPurgeJobState } from '../../api/gibPurge';

/**
 * Boşaltma işinin ekranda gösterilen türetilmiş bilgileri.
 *
 * Sunucu hız bildirmiyor; iki yoklama arasındaki `clearedCount` / `freedBytes` farkından
 * istemcide hesaplanıyor. Bu yüzden ilk yoklamada hız yok, ikinciden sonra görünür.
 */

/** Bir yoklamanın hız hesabı için saklanan kısmı. */
export interface PurgeSample {
    clearedCount: number;
    freedBytes: number;
    /** Yoklama anı (Unix ms). */
    at: number;
}

export interface PurgeRate {
    rowsPerSecond: number;
    gbPerHour: number;
}

export function toSample(state: XmlPurgeJobState, at: number): PurgeSample {
    return { clearedCount: state.control.clearedCount, freedBytes: state.control.freedBytes, at };
}

/**
 * İki yoklamadan hız üretir.
 *
 * null döndüğü durumlar: örnekler arasında anlamlı süre yok, sayaç geriye gitmiş
 * (`restart` ile imleç sıfırlanmış ya da başka bir pod devralmış olabilir) ya da hiç
 * ilerleme yok. Hepsinde "hız" uydurmak yanıltıcı olurdu.
 */
export function computePurgeRate(previous: PurgeSample | null, current: PurgeSample): PurgeRate | null {
    if (!previous) {
        return null;
    }

    const seconds = (current.at - previous.at) / 1000;

    if (seconds <= 0) {
        return null;
    }

    const rows = current.clearedCount - previous.clearedCount;
    const bytes = current.freedBytes - previous.freedBytes;

    if (rows < 0 || bytes < 0) {
        return null;
    }

    if (rows === 0 && bytes === 0) {
        return null;
    }

    return {
        rowsPerSecond: rows / seconds,
        // GB = 10^9 bayt; depolama tarafı da ondalık GB konuşuyor.
        gbPerHour: ((bytes / seconds) * 3600) / 1_000_000_000,
    };
}

/** 650000000 → "0,65 GB" */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 GB';
    }

    const gb = bytes / 1_000_000_000;

    if (gb >= 10) {
        return `${Math.round(gb)} GB`;
    }

    if (gb >= 0.01) {
        return `${gb.toFixed(2)} GB`;
    }

    return `${Math.round(bytes / 1_000_000)} MB`;
}

/**
 * İş açık görünüyor ama son parti üzerinden uzun zaman geçtiyse true.
 *
 * Neden gerekiyor: iş WAL birikimi yüzünden bekliyor olabilir, kiralamayı alan pod düşmüş
 * olabilir ya da sessizce durmuş olabilir. "Açık" rozeti tek başına bunu göstermiyor.
 */
export function isPurgeStalled(control: XmlPurgeControl, now: number, thresholdMs = 3 * 60 * 1000): boolean {
    if (!control.isEnabled) {
        return false;
    }

    if (!control.lastBatchAtUtc) {
        // Açık ama hiç parti işlenmemiş: başlangıçta normal, uzun sürerse değil.
        const startedAt = control.startedAtUtc ? Date.parse(control.startedAtUtc) : Number.NaN;

        return Number.isFinite(startedAt) && now - startedAt > thresholdMs;
    }

    const lastBatchAt = Date.parse(control.lastBatchAtUtc);

    if (!Number.isFinite(lastBatchAt)) {
        return false;
    }

    return now - lastBatchAt > thresholdMs;
}

/** `blockedIds` virgülle ayrılmış; boşları eleyip liste yapar. */
export function parseBlockedIds(blockedIds: string | null | undefined): string[] {
    if (!blockedIds) {
        return [];
    }

    return blockedIds
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
}

/** Yapılandırma izinlerinden hangileri kapalı. */
export function disabledSwitches(state: XmlPurgeJobState): string[] {
    const disabled: string[] = [];

    if (!state.purgeEnabled) {
        disabled.push('PurgeEnabled');
    }

    if (!state.readEnabled) {
        disabled.push('ReadEnabled');
    }

    if (!state.storeOnly) {
        disabled.push('StoreOnly');
    }

    return disabled;
}
