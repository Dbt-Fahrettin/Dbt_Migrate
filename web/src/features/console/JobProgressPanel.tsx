import {
    doneCount,
    estimatedRemainingMs,
    formatDuration,
    formatEta,
    percentDone,
    remainingCount,
} from '../../operations/jobProgress';
import type { JobProgress } from '../../operations/types';

/**
 * Süren işlerin ilerlemesi.
 *
 * Neden ayrı panel: günlük satırları sanal listede sabit yükseklikte ve `truncate` ile çiziliyor,
 * bu yüzden sunucunun yazdığı ilerleme metni ("… | tamam: 558 | hata: 2 | son: 500931 -> OK")
 * ekranda kesiliyordu. Aralık modunda tek iş binlerce veritabanını yarım saatten uzun sürede
 * gezdiği için kullanıcı nerede olduğunu hiç göremiyordu (11.11.2026).
 *
 * Panel yalnız okur: iptal/durdurma soldaki düğmelerde kalır.
 */
interface Props {
    jobs: JobProgress[];
}

export function JobProgressPanel({ jobs }: Props) {
    if (jobs.length === 0) {
        return null;
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                Süren işler ({jobs.length})
            </h2>

            <div className="mt-3 space-y-3">
                {jobs.map((job) => (
                    <JobRow key={job.jobId} job={job} />
                ))}
            </div>
        </section>
    );
}

function JobRow({ job }: { job: JobProgress }) {
    const done = doneCount(job);
    const remaining = remainingCount(job);
    const percent = percentDone(job);
    const isRunning = job.state === 'Processing';

    return (
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {job.displayName}
                </span>

                <span
                    className={[
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        isRunning
                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    ].join(' ')}
                >
                    {isRunning ? 'koşuyor' : 'kuyrukta'}
                </span>
            </div>

            {/* Oran yalnız toplam biliniyorsa; bilinmiyorsa uydurma yüzde göstermeyiz. */}
            {percent !== null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                        className="h-full rounded-full bg-sky-500 transition-all"
                        style={{ width: `${percent}%` }}
                    />
                </div>
            )}

            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <Cell label="İşlenen">
                    {job.total > 0 ? `${done} / ${job.total}` : String(done)}
                    {percent !== null && <span className="text-slate-400"> · %{percent}</span>}
                </Cell>

                {remaining !== null && <Cell label="Kalan">{remaining}</Cell>}

                {job.failCount > 0 && (
                    <Cell label="Hatalı">
                        <span className="text-red-600 dark:text-red-400">{job.failCount}</span>
                    </Cell>
                )}

                {isRunning && <Cell label="Geçen">{formatDuration(job.elapsedMs)}</Cell>}

                {isRunning && <Cell label="Tahmini kalan">{formatEta(estimatedRemainingMs(job))}</Cell>}
            </dl>

            {/*
                Sunucunun kendi satırı — kesilmeden. "son: 500931 -> OK" burada görünür; kullanıcının
                "hangi veritabanındayız" sorusunun doğrudan cevabı bu.
            */}
            {job.message && (
                <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {job.message}
                </p>
            )}
        </div>
    );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-baseline gap-1">
            <dt className="text-slate-500 dark:text-slate-400">{label}:</dt>
            <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">{children}</dd>
        </div>
    );
}
