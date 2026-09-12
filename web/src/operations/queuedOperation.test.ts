import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationLog } from './operationLog';
import { runQueuedOperation } from './queuedOperation';
import { getRangeTarget, resolvePackTargets } from './packTargets';
import type { JobStatus, PackTarget } from './types';

/**
 * Motor testleri sahte bir sunucuya karşı koşar.
 *
 * Gerekçe: kuyruk/izleme akışının gerçek uçlara karşı sınanması, canlı paket veritabanlarında
 * migration başlatmak demek olurdu. Burada fetch taklit edilerek satır yerinde güncelleme,
 * sayaçlar, atlanan/hatalı ayrımı ve "Durdur" davranışı doğrulanıyor.
 */

const API = 'https://ornek.test/svc/api';

interface FakeServerOptions {
    /** jobId başına, sırayla döndürülecek durumlar. Son durum tekrar eder. */
    statuses: Record<string, JobStatus[]>;
    /** Bu paketler için kuyruğa alma başarısız olur. */
    enqueueFailures?: Set<string>;
}

function target(packNo: string): PackTarget {
    return { packNo, packNoEnding: '', displayName: `Dbt_${packNo}` };
}

function status(partial: Partial<JobStatus>): JobStatus {
    return {
        jobId: '',
        state: 'Processing',
        isFound: true,
        isFinished: false,
        isSucceeded: false,
        okCount: 0,
        failCount: 0,
        skippedCount: 0,
        failures: null,
        message: '',
        error: null,
        ...partial,
    };
}

function installFakeServer(options: FakeServerOptions) {
    const pollCounts = new Map<string, number>();

    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
            // Durum sorgusu (POST)
            if (init?.method === 'POST') {
                const jobIds = JSON.parse(String(init.body)) as string[];

                const result = jobIds.map((jobId) => {
                    const sequence = options.statuses[jobId] ?? [];
                    const seen = pollCounts.get(jobId) ?? 0;

                    pollCounts.set(jobId, seen + 1);

                    const entry = sequence[Math.min(seen, sequence.length - 1)];

                    return { ...entry, jobId };
                });

                return new Response(JSON.stringify(result), { status: 200 });
            }

            // Kuyruğa alma (GET)
            const packNo = url.split('/').filter(Boolean).pop() ?? '';

            if (options.enqueueFailures?.has(packNo)) {
                return new Response('kuyruk dolu', { status: 500 });
            }

            return new Response(JSON.stringify({ isOk: true, jobId: `job-${packNo}` }), { status: 200 });
        }),
    );
}

/**
 * Motoru sahte zamanlayıcıyla koşturur.
 *
 * İzleme turları arasında 3 sn'lik gerçek bekleme var; testin bunu beklemesi gereksiz.
 * İş bitene kadar zamanlayıcılar ileri sarılır (her tur mikro görevler de boşaltılır).
 */
async function runWithTimers(promise: Promise<void>): Promise<void> {
    let isDone = false;

    const tracked = promise.then(() => {
        isDone = true;
    });

    for (let i = 0; i < 500 && !isDone; i += 1) {
        await vi.advanceTimersByTimeAsync(500);
    }

    await tracked;
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('runQueuedOperation', () => {
    it('her hedefi kuyruğa alır, biten işin satırını yerinde günceller ve sayaçları tutar', async () => {
        installFakeServer({
            statuses: {
                'job-500001': [
                    status({ state: 'Processing' }),
                    status({
                        state: 'Succeeded',
                        isFinished: true,
                        isSucceeded: true,
                        okCount: 1,
                        message: 'bitti',
                    }),
                ],
                // atlandı: başarılı ama uygulanacak veritabanı yok
                'job-500002': [
                    status({
                        state: 'Succeeded',
                        isFinished: true,
                        isSucceeded: true,
                        skippedCount: 1,
                        okCount: 0,
                    }),
                ],
                // hatalı
                'job-500003': [
                    status({
                        state: 'Failed',
                        isFinished: true,
                        isSucceeded: false,
                        failCount: 1,
                        message: 'patladı',
                        failures: ['Dbt_500003 -> 42P07'],
                    }),
                ],
            },
        });

        const log = new OperationLog();

        await runWithTimers(
            runQueuedOperation({
                apiBaseUrl: API,
                log,
                operationName: '1-Dbt-Migrate',
                headerText: 'test',
                targets: [target('500001'), target('500002'), target('500003')],
                buildEnqueueUrl: (t) => `${API}/master/dbt-migrate-all-bg/${t.packNo}`,
                signal: new AbortController().signal,
            }),
        );

        const snapshot = log.getSnapshot();

        expect(snapshot.counters.queued).toBe(3);
        expect(snapshot.counters.success).toBe(1);
        expect(snapshot.counters.skipped).toBe(1);
        expect(snapshot.counters.error).toBe(1);
        expect(snapshot.counters.pending).toBe(0);

        // "kuyruğa alındı" satırları yerinde değişmiş olmalı — yeni satır eklenmemeli.
        const joined = snapshot.lines.join('\n');

        expect(joined).toContain('Dbt_500001 --> tamamlandı | bitti');
        expect(joined).toContain('Dbt_500002 --> atlandı (migration uygulanacak veritabanı bulunamadı)');
        expect(joined).toContain('Dbt_500003 --> HATALI | patladı');
        expect(joined).not.toContain('Dbt_500001 --> kuyruğa alındı');

        // Hata satırı, başarısız işin ayrıntısını taşımalı.
        expect(snapshot.errors.join('\n')).toContain('42P07');

        expect(snapshot.state).toBe('failed');
    });

    it('kuyruğa alınamayan hedefi hata sayar ve akışı sürdürür', async () => {
        installFakeServer({
            statuses: {
                'job-500001': [status({ isFinished: true, isSucceeded: true, okCount: 1 })],
            },
            enqueueFailures: new Set(['500002']),
        });

        const log = new OperationLog();

        await runWithTimers(
            runQueuedOperation({
                apiBaseUrl: API,
                log,
                operationName: '0-Migrate',
                headerText: 'test',
                targets: [target('500001'), target('500002')],
                buildEnqueueUrl: (t) => `${API}/master/migrate-bg/${t.packNo}`,
                signal: new AbortController().signal,
            }),
        );

        const snapshot = log.getSnapshot();

        expect(snapshot.counters.queued).toBe(1);
        expect(snapshot.counters.success).toBe(1);
        expect(snapshot.counters.error).toBe(1);
        expect(snapshot.lines.join('\n')).toContain('Dbt_500002 --> kuyruğa alınamadı');
    });

    it('durum bulunamayan işi hata sayar ve bekleyenlerden düşürür', async () => {
        installFakeServer({
            statuses: {
                'job-500001': [status({ isFound: false })],
            },
        });

        const log = new OperationLog();

        await runWithTimers(
            runQueuedOperation({
                apiBaseUrl: API,
                log,
                operationName: '1-Dbt-Migrate',
                headerText: 'test',
                targets: [target('500001')],
                buildEnqueueUrl: (t) => `${API}/master/dbt-migrate-all-bg/${t.packNo}`,
                signal: new AbortController().signal,
            }),
        );

        const snapshot = log.getSnapshot();

        expect(snapshot.counters.error).toBe(1);
        expect(snapshot.counters.pending).toBe(0);
        expect(snapshot.errors.join('\n')).toContain('Hangfire panelinden kontrol edin');
    });

    it('Durdur yalnız kuyruğa almayı keser; kuyruğa girmiş iş izlenmeye devam eder', async () => {
        installFakeServer({
            statuses: {
                'job-500001': [status({ isFinished: true, isSucceeded: true, okCount: 1 })],
            },
        });

        const controller = new AbortController();
        const log = new OperationLog();

        // İlk hedef kuyruğa alınır alınmaz durdur.
        const targets = [target('500001'), target('500002'), target('500003')];

        await runWithTimers(
            runQueuedOperation({
                apiBaseUrl: API,
                log,
                operationName: '1-Dbt-Migrate',
                headerText: 'test',
                targets,
                buildEnqueueUrl: (t) => {
                    if (t.packNo === '500002') {
                        controller.abort();
                    }

                    return `${API}/master/dbt-migrate-all-bg/${t.packNo}`;
                },
                signal: controller.signal,
            }),
        );

        const snapshot = log.getSnapshot();

        // 500001 ve 500002 kuyruğa girdi (abort, 500002 url'i kurulurken istendi), 500003 hiç denenmedi.
        expect(snapshot.counters.queued).toBe(2);
        expect(snapshot.lines.join('\n')).toContain('kuyruğa alma durduruldu');
        expect(snapshot.lines.join('\n')).not.toContain('Dbt_500003');
    });

    it('hedef yoksa uyarı yazar ve çağrı yapmaz', async () => {
        installFakeServer({ statuses: {} });

        const log = new OperationLog();

        await runWithTimers(
            runQueuedOperation({
                apiBaseUrl: API,
                log,
                operationName: '0-Migrate',
                headerText: 'test',
                targets: [],
                buildEnqueueUrl: () => '',
                signal: new AbortController().signal,
            }),
        );

        expect(log.getSnapshot().lines.join('\n')).toContain('işlenecek veritabanı bulunamadı');
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('resolvePackTargets', () => {
    it('Start = 0 ise tek hedef Dbt_Temp olur', async () => {
        const targets = await resolvePackTargets(API, '0', '', null);

        expect(targets).toEqual([{ packNo: '0', packNoEnding: '', displayName: 'Dbt_Temp' }]);
    });

    it('Start sayı değilse boş liste döner', async () => {
        expect(await resolvePackTargets(API, '', '', null)).toEqual([]);
        expect(await resolvePackTargets(API, 'abc', '', null)).toEqual([]);
    });

    it('End doluysa aralık üretir ve ad listesinde olmayanı atlar', async () => {
        const targets = await resolvePackTargets(API, '500001', '500003', ['Dbt_500001', 'Dbt_500003']);

        expect(targets.map((d) => d.packNo)).toEqual(['500001', '500003']);
    });

    it('End boşsa ön ek modunda çalışır ve yalnız 6 haneli paketleri alır', async () => {
        const targets = await resolvePackTargets(API, '5', '', [
            'Dbt_500001',
            'Dbt_500002',
            'Dbt_5001', // 6 hane değil - atlanmalı
            'Dbt_600001', // ön ek tutmuyor - atlanmalı
        ]);

        expect(targets.map((d) => d.displayName)).toEqual(['Dbt_500001', 'Dbt_500002']);
    });

    it('ön ek modunda yerel liste boşsa sunucudan çeker', async () => {
        installFakeServer({ statuses: {} });

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify(['Dbt_500010', 'Dbt_500011']), { status: 200 })),
        );

        const targets = await resolvePackTargets(API, '5', '', null);

        expect(targets.map((d) => d.packNo)).toEqual(['500010', '500011']);
    });
});

describe('getRangeTarget', () => {
    it('aralık modu kapalıyken null döner', () => {
        expect(getRangeTarget([target('500001'), target('500002')], false)).toBeNull();
    });

    it('tek hedefte null döner - paket başına akış kullanılmalı', () => {
        expect(getRangeTarget([target('500001')], true)).toBeNull();
    });

    it('Dbt_Temp gibi sayısal olmayan hedefte null döner', () => {
        const temp: PackTarget = { packNo: '0', packNoEnding: '', displayName: 'Dbt_Temp' };

        expect(getRangeTarget([temp, temp], true)).toBeNull();
    });

    it('ilk ve son paketten tek aralık hedefi üretir', () => {
        const range = getRangeTarget([target('500003'), target('500001'), target('500002')], true);

        expect(range).toMatchObject({ packNo: '500001', packNoEnding: '500003' });
        expect(range?.displayName).toContain('3 db');
    });
});
