import type { EnvKey } from '../config/environments';

/**
 * Ortam rengi arayüzün her yerinde aynı anlamı taşır: Prod kırmızı, Test mavi, Local gri.
 * Yanlış ortamda işlem başlatmak bu araçtaki en büyük operasyonel risk — renk bunu
 * tek bakışta veriyor, o yüzden tek kaynaktan gelir.
 */
export const ENV_ACCENT: Record<EnvKey, { chip: string; ring: string; text: string; dot: string }> = {
    local: {
        chip: 'bg-slate-600 text-white',
        ring: 'ring-slate-500',
        text: 'text-slate-600 dark:text-slate-300',
        dot: 'bg-slate-500',
    },
    test: {
        chip: 'bg-sky-600 text-white',
        ring: 'ring-sky-500',
        text: 'text-sky-700 dark:text-sky-300',
        dot: 'bg-sky-500',
    },
    prod: {
        chip: 'bg-red-600 text-white',
        ring: 'ring-red-500',
        text: 'text-red-700 dark:text-red-300',
        dot: 'bg-red-500',
    },
};
