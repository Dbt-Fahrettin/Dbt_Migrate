/** Start/End kutularından üretilen, işlenecek tek veritabanı hedefi. */
export interface PackTarget {
    /** URL'de gidecek paket değeri ("0" => sunucu tarafında Dbt_Temp). */
    packNo: string;

    /** Yalnız aralık modunda dolu: aralığın bitiş paketi. */
    packNoEnding: string;

    /** Listede gösterilecek ad ("Dbt_500104" / "Dbt_Temp"). */
    displayName: string;

    /**
     * Bu hedefin kapsadığı veritabanı sayısı. Paket başına işte 1, aralık işinde aralıktaki
     * veritabanı sayısı. İlerleme panelindeki "kaç tane kaldı" ve tahmini süre buna dayanıyor;
     * bilinmiyorsa 0 kalır ve panel oran göstermez (uydurma yüzde göstermekten iyidir).
     */
    dbCount?: number;
}

/** master/dbt-migrate-all-bg (ve migrate-bg) yanıtı. */
export interface EnqueueResult {
    isOk?: boolean;
    packNoStarting?: number;
    migrationId?: string | null;
    jobId?: string | null;
    statusUrl?: string | null;
    message?: string | null;
}

/** master/dbt-migrate-status-bulk yanıtındaki tek iş kaydı. */
export interface JobStatus {
    jobId?: string | null;
    state?: string | null;
    isFound: boolean;
    isFinished: boolean;
    isSucceeded: boolean;
    okCount: number;
    failCount: number;
    skippedCount: number;
    failures?: string[] | null;
    message?: string | null;
    error?: string | null;
}

/** Durumu izlenen, henüz bitmemiş iş. */
export interface JobItem {
    packNo: string;
    displayName: string;
    jobId: string;

    /** Hedefin kapsadığı veritabanı sayısı (bkz. PackTarget.dbCount). */
    total?: number;
    /** Sonuç listesindeki satır indeksi — iş bitince o satır yerinde güncellenir. */
    lineIndex: number;
}

/**
 * Süren bir işin ekranda gösterilen ilerlemesi.
 *
 * Günlük satırı sanal listede kesildiği için (sabit satır yüksekliği) sunucunun yazdığı ilerleme
 * metni görünmüyordu; bu yapı onu ayrı bir panelde tam olarak göstermek için var.
 */
export interface JobProgress {
    jobId: string;
    displayName: string;

    /** Hangfire durumu: Enqueued | Processing | … */
    state: string;

    /** Kapsanan veritabanı sayısı; bilinmiyorsa 0. */
    total: number;

    okCount: number;
    failCount: number;
    skippedCount: number;

    /** Sunucunun kendi ilerleme metni — kesilmeden gösterilir ("son: 500123 -> OK"). */
    message: string;

    /** İstemcide ölçülen süre: iş ilk kez Processing görüldüğünde başlar. */
    elapsedMs: number;
}

export interface OperationCounters {
    queued: number;
    success: number;
    error: number;
    skipped: number;
    /** Durdurulduğu için kuyruktan düşürülen işler. */
    cancelled: number;
    pending: number;
}

export function emptyCounters(): OperationCounters {
    return { queued: 0, success: 0, error: 0, skipped: 0, cancelled: 0, pending: 0 };
}

/** Durum ışığı: WPF'teki gri/mavi/yeşil/turuncu karşılıkları. */
export type OperationState = 'ready' | 'running' | 'succeeded' | 'failed';

/**
 * Sunucuda süren bir migration işi.
 *
 * Kuyruk sunucuda tutuluyor: konsol kapatılıp açıldığında başlatılan işin akıbeti ancak buradan
 * öğrenilir. Bilinmediğinde aynı migration ikinci kez başlatılabiliyordu.
 */
export interface ActiveMigrateJob {
    jobId: string;
    /** Enqueued | Processing. */
    state: string;
    operation: string;
    packNoStarting: number;
    packNoEnding: number;
    migrationId: string;
    createdAtUtc: string | null;
    startedAtUtc: string | null;
    serverId: string | null;
    okCount: number;
    failCount: number;
    skippedCount: number;
    /** İşin en son dokunduğu paket — "ne aşamada" sorusunun cevabı. */
    lastPackNo: string | null;
    elapsed: string | null;
    message: string | null;
}

export interface ActiveMigrateJobs {
    queueName: string;
    enqueuedCount: number;
    processingCount: number;
    jobs: ActiveMigrateJob[];
}

export interface MigrateCancelItem {
    jobId: string;
    state: string;
    isDeleted: boolean;
    note: string;
}

export interface MigrateCancelResult {
    requestedCount: number;
    /** Kuyruktan gerçekten düşürülen, hiç koşmayacak işler. */
    deletedCount: number;
    /** Koşmakta olduğu için yarıda kesilemeyen işler. */
    runningCount: number;
    items: MigrateCancelItem[];
}
