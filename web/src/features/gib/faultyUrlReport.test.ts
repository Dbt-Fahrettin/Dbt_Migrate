import { describe, expect, it } from 'vitest';
import type { FaultyUrlHostDiagnosis, FaultyUrlHostSummary, FaultyUrlProbe } from '../../api/gibFaultyUrl';
import type { ApiResult } from '../../api/http';
import {
    HOST_RETRY_COUNT,
    buildMarkdownReport,
    buildSamplesCsv,
    describeChange,
    runDiagnosisLoop,
    selectHosts,
    summarizeByVerdict,
    toSnapshot,
} from './faultyUrlReport';
import type { DiagnoseCall, DiagnosisHostRow, DiagnosisRun } from './faultyUrlReport';

const GIB = 'https://test.unideva.com/gib/api';

function summary(host: string, pendingCount: number, abandonedCount = 0): FaultyUrlHostSummary {
    return {
        host,
        pendingCount,
        abandonedCount,
        packCount: 3,
        firstDate: '2026-01-02T00:00:00',
        lastDate: '2026-10-01T00:00:00',
        avgFailedNights: 4.5,
    };
}

function probe(partial: Partial<FaultyUrlProbe> = {}): FaultyUrlProbe {
    return {
        isOk: false,
        statusCode: 0,
        isAccessDenied: false,
        timedOut: false,
        throttled: false,
        usedLegacyTls: false,
        elapsedMs: 120,
        ...partial,
    };
}

function diagnosis(host: string, verdict: string, verdictText: string): FaultyUrlHostDiagnosis {
    return {
        host,
        sampleCount: 2,
        triedCount: 2,
        hwOkCount: verdict === 'IpRestricted' ? 2 : 0,
        directOkCount: 0,
        verdict,
        verdictText,
        reasonCounts: { [verdict]: 2 },
        samples: [
            {
                url: `https://${host}/doc/1`,
                invoiceDate: '2026-10-01T00:00:00',
                docType: 'EArchive',
                packNo: 500292,
                failedNightCount: 5,
                isAbandoned: false,
                reason: verdict,
                reasonText: verdictText,
                hw: probe({ isOk: verdict === 'IpRestricted', statusCode: 200 }),
                direct: probe({ statusCode: 403, kind: 'html', detail: 'HTTP 403; Erişim | reddedildi' }),
                recovered: verdict === 'IpRestricted',
                recoveryNote: verdict === 'IpRestricted' ? 'satır güncellendi (gib-hw)' : '',
            },
        ],
        directVantage: 'gib-api-7c9',
        elapsedSeconds: 12.3,
        recoveredCount: verdict === 'IpRestricted' ? 1 : 0,
        reopenedCount: verdict === 'IpRestricted' ? 40 : 0,
    };
}

function ok(data: FaultyUrlHostDiagnosis): ApiResult<FaultyUrlHostDiagnosis> {
    return { isSuccess: true, status: 200, content: '', data, error: '' };
}

function fail(status: number): ApiResult<FaultyUrlHostDiagnosis> {
    return { isSuccess: false, status, content: '', data: null, error: `Status Code: ${status}` };
}

describe('selectHosts', () => {
    it('filters by record count and sorts by records, limit 0 = all', () => {
        const hosts = [summary('a.com', 2), summary('b.com', 50, 10), summary('c.com', 0, 1), summary('d.com', 9)];

        expect(selectHosts(hosts, 1, 0).map((h) => h.host)).toEqual(['b.com', 'd.com', 'a.com', 'c.com']);
        expect(selectHosts(hosts, 5, 0).map((h) => h.host)).toEqual(['b.com', 'd.com']);
        expect(selectHosts(hosts, 1, 2).map((h) => h.host)).toEqual(['b.com', 'd.com']);
    });
});

describe('runDiagnosisLoop', () => {
    it('diagnoses every host and reports done', async () => {
        const rows: DiagnosisHostRow[] = [];
        const call: DiagnoseCall = async (_api, _token, host) => ok(diagnosis(host, 'Timeout', 'Zaman aşımı'));

        const state = await runDiagnosisLoop({
            gibApiBaseUrl: GIB,
            token: 't',
            hosts: [summary('a.com', 1), summary('b.com', 2), summary('c.com', 3)],
            sampleCount: 10,
            concurrency: 2,
            shouldStop: () => false,
            onRow: (row) => rows.push(row),
            onError: () => {},
            call,
        });

        expect(state).toBe('done');
        expect(rows.map((r) => r.summary.host).sort()).toEqual(['a.com', 'b.com', 'c.com']);
    });

    it('retries a transport failure, then records the host as failed and continues', async () => {
        const attempts: Record<string, number> = {};
        const rows: DiagnosisHostRow[] = [];
        const call: DiagnoseCall = async (_api, _token, host) => {
            attempts[host] = (attempts[host] ?? 0) + 1;

            return host === 'bad.com' ? fail(524) : ok(diagnosis(host, 'NotFound', 'Bulunamadı'));
        };

        const state = await runDiagnosisLoop({
            gibApiBaseUrl: GIB,
            token: 't',
            hosts: [summary('bad.com', 5), summary('good.com', 1)],
            sampleCount: 10,
            concurrency: 1,
            shouldStop: () => false,
            onRow: (row) => rows.push(row),
            onError: () => {},
            call,
        });

        expect(state).toBe('done');
        expect(attempts['bad.com']).toBe(1 + HOST_RETRY_COUNT);
        expect(rows.find((r) => r.summary.host === 'bad.com')?.diagnosis).toBeNull();
        expect(rows.find((r) => r.summary.host === 'good.com')?.diagnosis?.verdict).toBe('NotFound');
    });

    it('stops all workers on 401 without retrying', async () => {
        let calls = 0;
        const errors: string[] = [];
        const call: DiagnoseCall = async () => {
            calls += 1;

            return fail(401);
        };

        const state = await runDiagnosisLoop({
            gibApiBaseUrl: GIB,
            token: 't',
            hosts: [summary('a.com', 1), summary('b.com', 1), summary('c.com', 1)],
            sampleCount: 10,
            concurrency: 1,
            shouldStop: () => false,
            onRow: () => {},
            onError: (message) => errors.push(message),
            call,
        });

        expect(state).toBe('failed');
        expect(calls).toBe(1);
        expect(errors[0]).toContain('401');
    });

    it('reports stopped when asked to stop before all hosts are started', async () => {
        let stop = false;
        const call: DiagnoseCall = async (_api, _token, host) => {
            stop = true;

            return ok(diagnosis(host, 'Timeout', 'Zaman aşımı'));
        };

        const state = await runDiagnosisLoop({
            gibApiBaseUrl: GIB,
            token: 't',
            hosts: [summary('a.com', 1), summary('b.com', 1)],
            sampleCount: 10,
            concurrency: 1,
            shouldStop: () => stop,
            onRow: () => {},
            onError: () => {},
            call,
        });

        expect(state).toBe('stopped');
    });
});

function sampleRun(): DiagnosisRun {
    return {
        environmentKey: 'prod',
        startedAt: '2026-10-09T18:00:00.000Z',
        finishedAt: '2026-10-09T18:30:00.000Z',
        sampleCount: 10,
        plannedHostCount: 3,
        rows: [
            { summary: summary('izibiz.com.tr', 5000), diagnosis: diagnosis('izibiz.com.tr', 'IpRestricted', 'IP kısıtı'), error: '' },
            { summary: summary('old.com', 40, 60), diagnosis: diagnosis('old.com', 'NotFound', 'Bulunamadı'), error: '' },
            { summary: summary('down.com', 7), diagnosis: null, error: 'Status Code: 524' },
        ],
    };
}

describe('report', () => {
    it('groups verdicts by record count, failed calls separately', () => {
        const groups = summarizeByVerdict(sampleRun().rows);

        expect(groups.map((g) => [g.verdict, g.domains, g.records])).toEqual([
            ['IpRestricted', 1, 5000],
            ['NotFound', 1, 100],
            ['CallFailed', 1, 7],
        ]);
    });

    it('marks changed and new hosts against the previous full run', () => {
        const run = sampleRun();
        const previous = toSnapshot({
            ...run,
            rows: [{ ...run.rows[0], diagnosis: diagnosis('izibiz.com.tr', 'AccessDenied', 'Erişim reddi') }],
        });

        expect(describeChange(run.rows[0], previous)).toBe('önce: Erişim reddi');
        expect(describeChange(run.rows[1], previous)).toBe('yeni');
        expect(describeChange(run.rows[0], null)).toBe('');
    });

    it('builds a markdown report with actions and escapes table pipes', () => {
        const markdown = buildMarkdownReport(sampleRun(), null);

        expect(markdown).toContain('| IP kısıtı | 1 | 5000 | Host GibDocumentRoutes:ViaHw');
        expect(markdown).toContain('| izibiz.com.tr | 5000 | 0 | 3 | 2026-10-01 | IP kısıtı |');
        expect(markdown).toContain('| 2/2 | 0/2 | 1 | 40 |');
        expect(markdown).toContain('**1** kayıt kapandı');
        expect(markdown).toContain('**40** bırakılmış kayıt yeniden açıldı');
        expect(markdown).toContain('Teşhis ucu yanıt vermedi');
        expect(markdown).toContain('Erişim / reddedildi');
        expect(markdown).not.toContain('Erişim | reddedildi');
    });

    it('builds a semicolon CSV with BOM, quoting cells that contain separators', () => {
        const csv = buildSamplesCsv(sampleRun());
        const lines = csv.split('\r\n');

        expect(csv.startsWith('﻿Domain;Karar;Adres')).toBe(true);
        expect(lines[1]).toContain('izibiz.com.tr;IP kısıtı;https://izibiz.com.tr/doc/1;2026-10-01;EArchive;500292;5;');
        expect(lines[1]).toContain('"HTTP 403; Erişim | reddedildi"');
        expect(lines[1].endsWith(';evet;satır güncellendi (gib-hw)')).toBe(true);
        expect(lines.some((line) => line.startsWith('down.com;Teşhis ucu yanıt vermedi'))).toBe(true);
    });
});
