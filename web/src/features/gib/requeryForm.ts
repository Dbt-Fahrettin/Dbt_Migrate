/**
 * Paket yeniden sorgu formunun doğrulaması.
 *
 * Sınırlar sunucudaki `PackRequeryRequest` ile aynı (ChunkDays 1-31, BudgetSeconds 30-480);
 * burada da kontrol edilmesinin sebebi, hatayı GİB'e giden uzun bir işin ortasında değil
 * düğmeye basmadan önce göstermek.
 */
export interface RequeryForm {
    packNo: string;
    startDate: string;
    endDate: string;
    taxNumberOrIdn: string;
    chunkDays: string;
    budgetSeconds: string;
}

export const CHUNK_DAYS_RANGE = { min: 1, max: 31 } as const;
export const BUDGET_SECONDS_RANGE = { min: 30, max: 480 } as const;

export function validateRequeryForm(form: RequeryForm): string | null {
    const packNo = Number.parseInt(form.packNo.trim(), 10);

    if (!form.packNo.trim()) {
        return 'Paket no boş olamaz.';
    }

    if (!Number.isInteger(packNo) || packNo <= 0) {
        return 'Paket no pozitif bir sayı olmalı.';
    }

    if (!form.startDate) {
        return 'Başlangıç tarihi zorunlu.';
    }

    if (form.endDate && form.endDate < form.startDate) {
        return 'Bitiş tarihi başlangıç tarihinden önce olamaz.';
    }

    const chunkDays = Number.parseInt(form.chunkDays, 10);

    if (!Number.isInteger(chunkDays) || chunkDays < CHUNK_DAYS_RANGE.min || chunkDays > CHUNK_DAYS_RANGE.max) {
        return `Parça gün ${CHUNK_DAYS_RANGE.min}-${CHUNK_DAYS_RANGE.max} arasında olmalı.`;
    }

    const budgetSeconds = Number.parseInt(form.budgetSeconds, 10);

    if (
        !Number.isInteger(budgetSeconds) ||
        budgetSeconds < BUDGET_SECONDS_RANGE.min ||
        budgetSeconds > BUDGET_SECONDS_RANGE.max
    ) {
        return `Çağrı bütçesi ${BUDGET_SECONDS_RANGE.min}-${BUDGET_SECONDS_RANGE.max} sn arasında olmalı.`;
    }

    return null;
}
