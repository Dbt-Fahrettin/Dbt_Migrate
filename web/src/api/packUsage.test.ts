import { describe, expect, it } from 'vitest';

import { endpoints } from './endpoints';
import { DEFAULT_USAGE_RANGE, usageRangeOf } from './packUsage';

describe('usageRangeOf', () => {
    it('End doluysa Start..End', () => {
        expect(usageRangeOf('500000', '504997')).toEqual({ from: 500000, to: 504997 });
    });

    it('End boşsa Start önektir', () => {
        expect(usageRangeOf('50', '')).toEqual({ from: 500000, to: 509999 });
        expect(usageRangeOf('123', '')).toEqual({ from: 123000, to: 123999 });
    });

    it('çözülemezse varsayılan aralık', () => {
        expect(usageRangeOf('', '')).toEqual(DEFAULT_USAGE_RANGE);
        expect(usageRangeOf('0', '')).toEqual(DEFAULT_USAGE_RANGE);
        expect(usageRangeOf('1234567', '')).toEqual(DEFAULT_USAGE_RANGE);
    });
});

describe('aralık adresleri', () => {
    it('varsayılanlar sorgu dizesine yazılmaz', () => {
        expect(endpoints.migrateBetweenBg('http://x/', '1', '2')).not.toContain('?');
        expect(endpoints.dbtMigrateBetweenBg('http://x/', '1', '2', 'M')).not.toContain('?');
    });

    it('eşzamanlı ve öncelik yazılır', () => {
        expect(endpoints.migrateBetweenBg('http://x/', '1', '2', 3, true)).toMatch(/\?parallel=3&order=usage$/);
        expect(endpoints.dbtMigrateBetweenBg('http://x/', '1', '2', 'M', 1, true)).toMatch(/\?order=usage$/);
    });
});
