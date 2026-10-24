import type { ActiveMigrateJob, JobItem } from '../../operations/types';

/**
 * Sunucuda süren işlerin okunur hâli.
 *
 * Ayrı dosyada çünkü burada bir karar var: kullanıcıya "ne koşuyor, ne aşamada" sorusunu
 * cevaplayacak kadarını tek satırda vermek. Konsol kapatılıp açıldığında bu satır, aynı
 * migration'ın ikinci kez başlatılmasını engelleyen tek bilgidir.
 */

/** İşin hedefi: tek paket, aralık ya da Dbt_Temp (0). */
export function describeTarget(job: ActiveMigrateJob): string {
    if (job.packNoEnding > 0 && job.packNoEnding !== job.packNoStarting) {
        return `Dbt_${job.packNoStarting} - Dbt_${job.packNoEnding}`;
    }

    if (job.packNoStarting === 0) {
        return 'Dbt_Temp';
    }

    return `Dbt_${job.packNoStarting}`;
}

/**
 * Tek satırlık özet: durum, hedef, ilerleme.
 *
 * İlerleme yalnız iş kendi sayacını yazdıysa görünür; yazmadıysa satır sessizce kısalır —
 * uydurma bir "%0" göstermek, hiç göstermemekten kötüdür.
 */
export function describeActiveJob(job: ActiveMigrateJob): string {
    const parts: string[] = [job.state === 'Processing' ? 'koşuyor' : 'kuyrukta', describeTarget(job)];

    if (job.migrationId) {
        parts.push(job.migrationId);
    }

    const done = job.okCount + job.failCount + job.skippedCount;

    if (done > 0) {
        parts.push(`${done} paket işlendi`);
    }

    if (job.lastPackNo) {
        parts.push(`son: ${job.lastPackNo}`);
    }

    if (job.elapsed) {
        parts.push(job.elapsed);
    }

    return parts.join(' · ');
}

/**
 * İzleme döngüsünün beklediği biçime çevirir.
 *
 * `lineIndex` burada 0: gerçek satır numarasını, satırı yazan taraf (kuyruk motoru) verir.
 */
export function resumeJobItems(jobs: ActiveMigrateJob[]): JobItem[] {
    return jobs.map((job) => ({
        packNo: String(job.packNoStarting),
        displayName: describeTarget(job),
        jobId: job.jobId,
        lineIndex: 0,
    }));
}
