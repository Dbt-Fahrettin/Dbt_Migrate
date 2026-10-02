import { describe, expect, it } from 'vitest';
import { formatMigrationLabel, groupDbtMigrationNames } from './dbtMigrationNames';

/** Test ortamından 12.09.2026'da gerçekten dönen liste. */
const REAL_NAMES = [
    '20200804032358_Init',
    '20260828135916_Aug26_28_1',
    '20260902072415_Sep26_02_1',
    '20260904080939_Sep26_04_1',
    '20260910120000_SuitSConsumption',
    '20260910160000_SuitSMrpPlans',
    'AllFunctions',
    'EBookQuotaOff',
    'EBookQuotaOn',
    'EBookQuotaTrackingOff',
    'MigrationHistoryCleanup',
    'MigrationHistoryInit',
    'ModelIndexes',
    'PackCompanySync',
    'SempVoucherAccDocTwinRepair',
    'SempVoucherSettingsRekey',
];

describe('groupDbtMigrationNames', () => {
    it("sürüm migration'larını bağımsız işlemlerden ayırır", () => {
        const groups = groupDbtMigrationNames(REAL_NAMES);

        expect(groups.versioned).toHaveLength(6);
        expect(groups.standalone).toHaveLength(10);
        expect(groups.standalone).toContain('AllFunctions');
        expect(groups.standalone).toContain('ModelIndexes');
    });

    it('en güncel olarak zaman damgası en büyük olanı seçer, alfabetik sonuncuyu değil', () => {
        const groups = groupDbtMigrationNames(REAL_NAMES);

        expect(groups.latest).toBe('20260910160000_SuitSMrpPlans');
        // Düz alfabetik sıralamada sonuncu bu olurdu — tam da kaçınılan hata.
        expect(groups.latest).not.toBe('SempVoucherSettingsRekey');
    });

    it('sürüm listesini yeniden eskiye sıralar', () => {
        const groups = groupDbtMigrationNames(REAL_NAMES);

        expect(groups.versioned[0]).toBe('20260910160000_SuitSMrpPlans');
        expect(groups.versioned[groups.versioned.length - 1]).toBe('20200804032358_Init');
    });

    it("hiç sürüm migration'ı yoksa en güncel boş kalır", () => {
        const groups = groupDbtMigrationNames(['AllFunctions', 'ModelIndexes']);

        expect(groups.latest).toBe('');
        expect(groups.versioned).toEqual([]);
    });
});

describe('formatMigrationLabel', () => {
    it('zaman damgasını okunur tarihe çevirir', () => {
        expect(formatMigrationLabel('20260910160000_SuitSMrpPlans')).toBe('SuitSMrpPlans · 10.09.2026 16:00');
    });

    it('bağımsız adı olduğu gibi bırakır', () => {
        expect(formatMigrationLabel('AllFunctions')).toBe('AllFunctions');
    });
});
