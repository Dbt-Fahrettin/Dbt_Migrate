import { describe, expect, it } from 'vitest';

import type { AdoBuild, AdoBuildDefinition, AdoReleaseDefinition } from '../../api/azureDevOps';
import {
    buildState,
    canStartEnvironment,
    environmentState,
    groupServices,
    isReleaseActive,
    lastSucceededBuild,
    pendingApprovalOf,
    serviceNameOf,
    sortServices,
} from './pipelineModel';

const art = (id: number) => [{ alias: 'manifest', type: 'Build', definitionReference: { definition: { id: String(id) } } }];

describe('servis adı', () => {
    it('release adından servisi çıkarır', () => {
        expect(serviceNameOf('login-deploy (TEST-PROD)')).toBe('login');
        expect(serviceNameOf('etr-credentials-deploy (TEST)')).toBe('etr-credentials');
        expect(serviceNameOf('devatekcom-deploy')).toBe('devatekcom');
        expect(serviceNameOf('Service.Api (Test-Prod)')).toBe('Service.Api');
        expect(serviceNameOf('Unideva.Zone (Test-Prod-Web)')).toBe('Unideva.Zone');
    });
});

describe('hatları gruplama', () => {
    const builds: AdoBuildDefinition[] = [
        { id: 157, name: 'login-build (PTT)' },
        { id: 106, name: 'login-build (TEST-PROD)' },
        { id: 145, name: 'devatekcom-build (PROD)' },
    ];
    const releases: AdoReleaseDefinition[] = [
        { id: 21, name: 'login-deploy (TEST)', artifacts: art(157), environments: [{ id: 1, name: 'TEST' }] },
        { id: 1, name: 'login-deploy (TEST-PROD)', artifacts: art(106), environments: [{ id: 2, name: 'Test' }, { id: 3, name: 'Huawei' }] },
        { id: 18, name: 'devatekcom-deploy', artifacts: art(145), environments: [{ id: 4, name: 'PROD' }] },
        { id: 99, name: 'x-deploy (TEST)', artifacts: art(12345), environments: [{ id: 5, name: 'TEST' }] },
    ];

    it('test hattını canlı hattından ayırır, devatekcom ve bağsız release atlanır', () => {
        const groups = groupServices(builds, releases);

        expect(groups).toHaveLength(1);
        expect(groups[0].service).toBe('login');
        expect(groups[0].tracks.map((t) => [t.kind, t.build.id, t.release.id])).toEqual([
            ['test', 157, 21],
            ['prod', 106, 1],
        ]);
        expect(groups[0].tracks[1].artifactAlias).toBe('manifest');
    });
});

describe('durumlar', () => {
    it('build durumu', () => {
        const b = (patch: Partial<AdoBuild>): AdoBuild => ({ id: 1, buildNumber: '2611.25.1', status: 'completed', ...patch });

        expect(buildState(undefined).tone).toBe('idle');
        expect(buildState(b({ status: 'inProgress' })).label).toBe('Çalışıyor');
        expect(buildState(b({ result: 'succeeded' })).tone).toBe('ok');
        expect(buildState(b({ result: 'failed' })).tone).toBe('bad');
        expect(lastSucceededBuild([b({ id: 3, result: 'failed' }), b({ id: 2, result: 'succeeded' })])?.id).toBe(2);
    });

    it('onay bekleyen ortam', () => {
        const env = { id: 3, name: 'Huawei', status: 'notStarted', preDeployApprovals: [{ id: 77, status: 'pending', approvalType: 'preDeploy', isAutomated: false }] };

        expect(pendingApprovalOf(env)).toBe(77);
        expect(environmentState(env).label).toBe('Onay bekliyor');
        expect(canStartEnvironment([env], 0)).toBe(false);
        expect(isReleaseActive({ id: 1, name: 'r', environments: [env] })).toBe(true);
    });

    it('otomatik onay beklemez; sonraki ortam öncekiler bitince başlatılabilir', () => {
        const env = { id: 2, name: 'Test', status: 'notStarted', preDeployApprovals: [{ id: 5, status: 'pending', isAutomated: true }] };

        expect(pendingApprovalOf(env)).toBeNull();
        expect(canStartEnvironment([env], 0)).toBe(false);
        const prod = { id: 3, name: 'Huawei', status: 'notStarted' };

        expect(canStartEnvironment([{ ...env, status: 'inProgress' }, prod], 1)).toBe(false);
        expect(canStartEnvironment([{ ...env, status: 'succeeded' }, prod], 1)).toBe(true);
        expect(environmentState({ ...env, status: 'succeeded' }).tone).toBe('ok');
    });
});

describe('sıralama', () => {
    const g = (service: string) => ({ service, tracks: [] });

    it('numaralılar önce, kalanlar alfabetik', () => {
        const sorted = sortServices([g('news'), g('admin'), g('login'), g('static'), g('ntf')], { static: 1, login: 2 });

        expect(sorted.map((x) => x.service)).toEqual(['static', 'login', 'admin', 'news', 'ntf']);
    });

    it('aynı numarada alfabetik', () => {
        expect(sortServices([g('b'), g('a')], { a: 1, b: 1 }).map((x) => x.service)).toEqual(['a', 'b']);
    });
});
