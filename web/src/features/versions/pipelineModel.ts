/**
 * Yayın hattı (Azure DevOps) ekranının saf kuralları.
 *
 * Servis listesi sabit tutulmaz: release tanımlarından türetilir. Her release tanımı bir build tanımına bağlıdır ve
 * ortamlarına bakılarak iki türden biri sayılır:
 *   - Test hattı  ("… (PTT)")        → yalnız Test ortamı
 *   - Canlı hattı ("… (TEST-PROD)")  → Test (otomatik) + Huawei/Prod (onaylı)
 * Böylece yeni bir dbt servisi Azure'a eklenince Konsol'da kendiliğinden görünür.
 */

import type {
    AdoBuild,
    AdoBuildDefinition,
    AdoRelease,
    AdoReleaseDefinition,
    AdoReleaseEnvironment,
} from '../../api/azureDevOps';

export type TrackKind = 'test' | 'prod';

export interface Track {
    key: string;
    kind: TrackKind;
    service: string;
    build: AdoBuildDefinition;
    release: AdoReleaseDefinition;
    /** Release tanımındaki build artifact takma adı (release oluştururken gerekir). */
    artifactAlias: string;
}

export interface ServiceGroup {
    service: string;
    tracks: Track[];
}

/** dbt dışı / kapatılacak hatlar listede çıkmaz (devatekcom eski siteye ait, dokunulmaz). */
export const EXCLUDED_SERVICES = ['devatekcom'];

const PROD_ENV = /huawei|prod|canl/i;

/** "etr-credentials-deploy (TEST-PROD)" → "etr-credentials". */
export function serviceNameOf(releaseName: string): string {
    const match = /^(.*?)[-\s]deploy\b/i.exec(releaseName.trim());

    return (match ? match[1] : releaseName.replace(/\s*\(.*\)\s*$/, '')).trim();
}

export function isProdEnvironmentName(name: string): boolean {
    return PROD_ENV.test(name);
}

function kindOf(release: AdoReleaseDefinition): TrackKind {
    return (release.environments ?? []).some((e) => isProdEnvironmentName(e.name)) ? 'prod' : 'test';
}

export function groupServices(builds: AdoBuildDefinition[], releases: AdoReleaseDefinition[]): ServiceGroup[] {
    const buildById = new Map(builds.map((b) => [b.id, b]));
    const groups = new Map<string, Track[]>();

    for (const release of releases) {
        const service = serviceNameOf(release.name);

        if (EXCLUDED_SERVICES.includes(service.toLowerCase())) {
            continue;
        }

        const artifact = (release.artifacts ?? []).find((a) => a.type === 'Build');
        const build = buildById.get(Number(artifact?.definitionReference?.definition?.id));

        if (!artifact || !build) {
            continue;
        }

        const kind = kindOf(release);
        const track: Track = { key: `${service}:${kind}`, kind, service, build, release, artifactAlias: artifact.alias };

        groups.set(service, [...(groups.get(service) ?? []), track]);
    }

    return [...groups.entries()]
        .map(([service, tracks]) => ({ service, tracks: tracks.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'test' ? -1 : 1)) }))
        .sort((a, b) => a.service.localeCompare(b.service, 'tr'));
}

/** Kullanıcının verdiği sıra numaraları (servis adı → numara). */
export type ServiceOrders = Record<string, number>;

/** Numara verilenler küçükten büyüğe önce, kalanlar alfabetik. Aynı numarada alfabetik. */
export function sortServices(groups: ServiceGroup[], orders: ServiceOrders): ServiceGroup[] {
    const orderOf = (g: ServiceGroup): number => {
        const n = orders[g.service];

        return typeof n === 'number' && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    };

    return [...groups].sort((a, b) => {
        const diff = orderOf(a) - orderOf(b);

        // Sonsuz - sonsuz NaN verir; ikisi de numarasızsa alfabetiğe düş.
        return Number.isNaN(diff) || diff === 0 ? a.service.localeCompare(b.service, 'tr') : diff;
    });
}

export type Tone = 'ok' | 'bad' | 'run' | 'wait' | 'idle';

export interface StateLabel {
    label: string;
    tone: Tone;
}

export function isBuildRunning(build: AdoBuild | undefined): boolean {
    return !!build && (build.status === 'inProgress' || build.status === 'notStarted' || build.status === 'cancelling');
}

export function buildState(build: AdoBuild | undefined): StateLabel {
    if (!build) {
        return { label: 'Build yok', tone: 'idle' };
    }

    if (isBuildRunning(build)) {
        return { label: build.status === 'notStarted' ? 'Kuyrukta' : 'Çalışıyor', tone: 'run' };
    }

    switch (build.result) {
        case 'succeeded':
            return { label: 'Başarılı', tone: 'ok' };
        case 'partiallySucceeded':
            return { label: 'Kısmen başarılı', tone: 'wait' };
        case 'canceled':
            return { label: 'İptal', tone: 'idle' };
        default:
            return { label: 'Başarısız', tone: 'bad' };
    }
}

/** Beklemekte olan, elle verilecek ön onay (otomatik olanlar sayılmaz). */
export function pendingApprovalOf(env: AdoReleaseEnvironment): number | null {
    const approval = (env.preDeployApprovals ?? []).find((a) => a.status === 'pending' && !a.isAutomated);

    return approval ? approval.id : null;
}

export function environmentState(env: AdoReleaseEnvironment): StateLabel {
    if (pendingApprovalOf(env) !== null) {
        return { label: 'Onay bekliyor', tone: 'wait' };
    }

    switch (env.status) {
        case 'succeeded':
            return { label: 'Tamamlandı', tone: 'ok' };
        case 'inProgress':
            return { label: 'Dağıtılıyor', tone: 'run' };
        case 'queued':
        case 'scheduled':
            return { label: 'Kuyrukta', tone: 'run' };
        case 'partiallySucceeded':
            return { label: 'Kısmen başarılı', tone: 'wait' };
        case 'rejected':
            return { label: 'Reddedildi', tone: 'bad' };
        case 'canceled':
            return { label: 'İptal', tone: 'idle' };
        default:
            return { label: 'Başlamadı', tone: 'idle' };
    }
}

export function isEnvironmentRunning(env: AdoReleaseEnvironment): boolean {
    return env.status === 'inProgress' || env.status === 'queued' || env.status === 'scheduled';
}

/** Release'in en az bir ortamı sürüyorsa ya da onay bekliyorsa izlenmeye devam edilir. */
export function isReleaseActive(release: AdoRelease): boolean {
    return (release.environments ?? []).some((e) => isEnvironmentRunning(e) || pendingApprovalOf(e) !== null);
}

/**
 * Elle başlatılabilir: ilk ortam kendiliğinden başlar; sonrakiler, öncekilerin hepsi tamamlanmış ve onay beklemiyorsa.
 * (Test bitmeden canlı ortam başlatılmasın.)
 */
export function canStartEnvironment(envs: AdoReleaseEnvironment[], index: number): boolean {
    const env = envs[index];

    return (
        index > 0 &&
        env.status === 'notStarted' &&
        pendingApprovalOf(env) === null &&
        envs.slice(0, index).every((e) => e.status === 'succeeded')
    );
}

export function lastSucceededBuild(builds: AdoBuild[]): AdoBuild | undefined {
    return builds.find((b) => b.status === 'completed' && b.result === 'succeeded');
}

export function releaseDescription(actor: string, build: Pick<AdoBuild, 'buildNumber'>): string {
    return `Admin Console: ${build.buildNumber}${actor ? ` (${actor})` : ''}`;
}

/** Canlı hattında onay penceresinin özet satırları. */
export function confirmLines(action: string, track: Track, detail?: string): string[] {
    return [
        `İşlem: ${action}`,
        `Servis: ${track.service}`,
        `Hat: ${track.kind === 'prod' ? 'Test + Canlı' : 'Test'} (${track.build.name})`,
        ...(detail ? [detail] : []),
    ];
}

export function formatWhen(iso: string | undefined): string {
    if (!iso) {
        return '';
    }

    const date = new Date(iso);

    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
