/**
 * Derleme sırasında vite.config.ts tarafından gömülen yapı damgası.
 * Ekranda gösterilir; destek konuşmasında "hangi build?" sorusunun cevabı.
 */

declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_TIME__: string;

export const BUILD_INFO = {
    version: __APP_VERSION__,
    gitSha: __GIT_SHA__,
    buildTime: __BUILD_TIME__,
};

/** "v1.0.0 · 5b601b0 · 12.09.2026" */
export function buildStamp(): string {
    const date = new Date(BUILD_INFO.buildTime);

    const stamped = Number.isNaN(date.getTime())
        ? ''
        : ` · ${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;

    return `v${BUILD_INFO.version} · ${BUILD_INFO.gitSha}${stamped}`;
}
