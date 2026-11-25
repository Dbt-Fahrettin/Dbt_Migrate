/**
 * Azure DevOps (devatek/dbt) pipeline ve release uçları.
 *
 * Kimlik: kullanıcının kendi PAT'i (Basic, kullanıcı adı boş). Anahtar yalnız bu cihazda durur; Azure'da işlemi
 * başlatan kişi kendi adıyla görünür. dev.azure.com ve vsrm.dev.azure.com her kökene CORS açıktır
 * (`authorization` başlığı dahil), bu yüzden tarayıcıdan, PWA'dan ve APK'dan aracı servis olmadan çağrılır.
 *
 * PAT yetkileri: Build (Read & execute), Release (Read, write, execute & manage).
 */

import { getJson, patchJson, postJson } from './http';
import type { ApiResult } from './http';

export const AZURE_ORG = 'devatek';

/** Konsolun yönettiği Azure DevOps projeleri (aynı organizasyon, aynı PAT). */
export const AZURE_PROJECTS = ['dbt', 'unideva'] as const;
export type AzureProject = (typeof AZURE_PROJECTS)[number];

const buildRoot = (project: string): string => `https://dev.azure.com/${AZURE_ORG}/${project}/_apis`;
const releaseRoot = (project: string): string => `https://vsrm.dev.azure.com/${AZURE_ORG}/${project}/_apis`;
const API = 'api-version=7.1';

export interface AdoBuild {
    id: number;
    buildNumber: string;
    /** notStarted | inProgress | completed | cancelling | postponed */
    status: string;
    /** succeeded | partiallySucceeded | failed | canceled (yalnız tamamlanınca) */
    result?: string;
    queueTime?: string;
    finishTime?: string;
    requestedFor?: { displayName?: string };
    _links?: { web?: { href?: string } };
}

export interface AdoBuildDefinition {
    id: number;
    name: string;
}

export interface AdoReleaseArtifact {
    alias: string;
    type: string;
    definitionReference?: {
        definition?: { id?: string; name?: string };
        version?: { id?: string; name?: string };
    };
}

export interface AdoReleaseDefinition {
    id: number;
    name: string;
    artifacts?: AdoReleaseArtifact[];
    environments?: { id: number; name: string }[];
}

export interface AdoApproval {
    id: number;
    /** pending | approved | rejected | reassigned | canceled | skipped */
    status: string;
    /** preDeploy | postDeploy */
    approvalType?: string;
    isAutomated?: boolean;
}

export interface AdoReleaseEnvironment {
    id: number;
    name: string;
    /** notStarted | inProgress | succeeded | canceled | rejected | queued | scheduled | partiallySucceeded */
    status: string;
    preDeployApprovals?: AdoApproval[];
}

export interface AdoRelease {
    id: number;
    name: string;
    status?: string;
    createdOn?: string;
    createdBy?: { displayName?: string };
    description?: string;
    artifacts?: AdoReleaseArtifact[];
    environments?: AdoReleaseEnvironment[];
    _links?: { web?: { href?: string } };
}

interface Listed<T> {
    value: T[];
}

export function authHeaders(pat: string): Record<string, string> {
    return { Authorization: `Basic ${btoa(`:${pat.trim()}`)}` };
}

/**
 * PAT geçersizse Azure 401 yerine 203 + giriş sayfası (HTML) döner; yanıtı kullanıcıya söylenecek metne çevirir.
 * Boş dönerse sorun yok.
 */
export function describeAzureFailure<T>(result: ApiResult<T>): string {
    if (result.status === 401 || result.status === 203 || result.content.trimStart().startsWith('<')) {
        return 'Azure DevOps kimlik doğrulaması reddedildi. PAT geçersiz ya da süresi dolmuş olabilir.';
    }

    if (result.status === 403) {
        return 'Bu işlem için PAT yetkisi yetmiyor (403). Build ve Release için okuma + yürütme yetkisi gerekir.';
    }

    if (!result.isSuccess) {
        return `${result.error || 'Azure DevOps\'a ulaşılamadı.'}`;
    }

    return '';
}

export function listBuildDefinitions(
    project: string,
    pat: string, signal?: AbortSignal): Promise<ApiResult<Listed<AdoBuildDefinition>>> {
    return getJson(`${buildRoot(project)}/build/definitions?${API}`, signal, authHeaders(pat));
}

export function listReleaseDefinitions(
    project: string,
    pat: string, signal?: AbortSignal): Promise<ApiResult<Listed<AdoReleaseDefinition>>> {
    return getJson(
        `${releaseRoot(project)}/release/definitions?%24expand=artifacts%2Cenvironments&${API}`,
        signal,
        authHeaders(pat),
    );
}

export function listBuilds(
    project: string,
    pat: string, definitionId: number, top: number, signal?: AbortSignal): Promise<ApiResult<Listed<AdoBuild>>> {
    return getJson(
        `${buildRoot(project)}/build/builds?definitions=${definitionId}&%24top=${top}&queryOrder=queueTimeDescending&${API}`,
        signal,
        authHeaders(pat),
    );
}

export function queueBuild(
    project: string,
    pat: string, definitionId: number, signal?: AbortSignal): Promise<ApiResult<AdoBuild>> {
    return postJson(`${buildRoot(project)}/build/builds?${API}`, { definition: { id: definitionId } }, signal, authHeaders(pat));
}

export function listReleases(
    project: string,
    pat: string, definitionId: number, top: number, signal?: AbortSignal): Promise<ApiResult<Listed<AdoRelease>>> {
    return getJson(
        `${releaseRoot(project)}/release/releases?definitionId=${definitionId}&%24top=${top}&%24expand=environments%2Cartifacts&queryOrder=descending&${API}`,
        signal,
        authHeaders(pat),
    );
}

export function createRelease(
    project: string,
    pat: string,
    definitionId: number,
    artifactAlias: string,
    build: Pick<AdoBuild, 'id' | 'buildNumber'>,
    description: string,
    signal?: AbortSignal,
): Promise<ApiResult<AdoRelease>> {
    return postJson(
        `${releaseRoot(project)}/release/releases?${API}`,
        {
            definitionId,
            description,
            isDraft: false,
            reason: 'none',
            artifacts: [{ alias: artifactAlias, instanceReference: { id: String(build.id), name: build.buildNumber } }],
        },
        signal,
        authHeaders(pat),
    );
}

export function approveRelease(
    project: string,
    pat: string, approvalId: number, comment: string, signal?: AbortSignal): Promise<ApiResult<AdoApproval>> {
    return patchJson(`${releaseRoot(project)}/release/approvals/${approvalId}?${API}`, { status: 'approved', comment }, signal, authHeaders(pat));
}

/** Elle başlatılan (otomatik tetiklenmeyen) ortamı çalıştırır. */
export function startEnvironment(
    project: string,
    pat: string,
    releaseId: number,
    environmentId: number,
    comment: string,
    signal?: AbortSignal,
): Promise<ApiResult<AdoReleaseEnvironment>> {
    return patchJson(
        `${releaseRoot(project)}/release/releases/${releaseId}/environments/${environmentId}?${API}`,
        { status: 'inProgress', comment },
        signal,
        authHeaders(pat),
    );
}
