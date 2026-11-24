import { describe, expect, it } from 'vitest';

import {
    BUILT_IN_TEMPLATES,
    confirmLines,
    describeStep,
    newStep,
    parseTemplate,
    validateStep,
    validateTemplate,
} from './migrationTemplate';
import { OperationLog } from './operationLog';
import type { OperationRequest } from './adminOperations';
import { requestForStep, runTemplate } from './templateRunner';

function baseRequest(signal: AbortSignal = new AbortController().signal): OperationRequest {
    return {
        apiBaseUrl: 'http://x/',
        log: new OperationLog(),
        operationName: '',
        startText: '',
        endText: '',
        datNames: null,
        isBetweenMode: false,
        dbtMigrationName: '',
        functionName: '',
        docStartDate: '',
        docEndDate: '',
        onlyMissing: false,
        withTaxpayers: false,
        token: '',
        vknText: '',
        signal,
    };
}

const FULL = {
    id: 'full',
    name: 'tam',
    isBuiltIn: true,
    steps: [...BUILT_IN_TEMPLATES[0].steps, ...BUILT_IN_TEMPLATES[1].steps],
};

describe('yerleşik şablon', () => {
    it('geçerli ve her grupta önce Migration sonra ModelIndexes', () => {
        const template = FULL;

        expect(validateTemplate(template)).toBe('');
        expect(template.steps.map((d) => d.kind)).toEqual([
            'migrate',
            'dbtMigrate',
            'migrate',
            'dbtMigrate',
            'migrate',
            'dbtMigrate',
        ]);
        expect(template.steps.map((d) => d.start)).toEqual(['0', '0', '123', '123', '50', '50']);
        expect(template.steps.every((d) => d.onError === 'stop')).toBe(true);
    });

    it('canlı adımlar aralık, eşzamanlı ve kullanım öncelikli', () => {
        const live = FULL.steps.filter((d) => d.start === '50');

        expect(live.every((d) => d.isRange && d.parallel === 3 && d.orderByUsage)).toBe(true);
    });
});

describe('doğrulama', () => {
    it('Dbt_Temp için aralık ve öncelik reddedilir', () => {
        expect(validateStep(newStep({ start: '0', isRange: true }))).not.toBe('');
        expect(validateStep(newStep({ start: '0' }))).toBe('');
    });

    it('öncelik ve eşzamanlılık yalnız aralık modunda', () => {
        expect(validateStep(newStep({ start: '50', orderByUsage: true }))).not.toBe('');
        expect(validateStep(newStep({ start: '50', parallel: 3 }))).not.toBe('');
        expect(validateStep(newStep({ start: '50', isRange: true, parallel: 3, orderByUsage: true }))).toBe('');
    });

    it('eşzamanlı 1-5 dışı, Dbt adı boş, End < Start reddedilir', () => {
        expect(validateStep(newStep({ start: '50', isRange: true, parallel: 6 }))).not.toBe('');
        expect(validateStep(newStep({ kind: 'dbtMigrate', start: '50' }))).not.toBe('');
        expect(validateStep(newStep({ start: '500100', end: '500000', isRange: true }))).not.toBe('');
    });

    it('şablon hatası adım numarasını söyler', () => {
        const template = { ...FULL, steps: [newStep({ start: '0' }), newStep({ start: 'x' })] };

        expect(validateTemplate(template)).toMatch(/^Adım 2:/);
    });
});

describe('metinler', () => {
    it('adım özeti ve onay satırları sırayı gösterir', () => {
        const step = FULL.steps[5];

        expect(describeStep(step)).toBe('1-Dbt-Migrate ModelIndexes · 50* · aralık, 3 eşzamanlı, kullanım önceliği');

        const lines = confirmLines(FULL);

        expect(lines).toHaveLength(8);
        expect(lines[2]).toMatch(/^1\. 0-Migrate · Dbt_Temp/);
    });
});

describe('saklama biçimi', () => {
    it('bozuk kaydı yok sayar, geçerliyi okur', () => {
        expect(parseTemplate(null)).toBeNull();
        expect(parseTemplate({ id: 'a', name: 'b', steps: [{ kind: 'x', start: '0' }] })).toBeNull();

        const ok = parseTemplate({ id: 'a', name: 'b', steps: [{ kind: 'migrate', start: '0' }] });

        expect(ok?.steps[0].onError).toBe('stop');
        expect(ok?.steps[0].parallel).toBe(1);
    });
});

describe('çalıştırıcı', () => {
    it('adım girdilerini işlem isteğine çevirir', () => {
        const request = requestForStep(baseRequest(), FULL.steps[5]);

        expect(request).toMatchObject({
            startText: '50',
            endText: '',
            isBetweenMode: true,
            rangeParallel: 3,
            rangeOrderByUsage: true,
            dbtMigrationName: 'ModelIndexes',
        });
    });

    it('adımları sırayla çalıştırır', async () => {
        const seen: string[] = [];

        const result = await runTemplate(FULL, baseRequest(), async (kind, request) => {
            seen.push(`${kind}:${request.startText}`);
        });

        expect(seen).toEqual(['0:0', '1:0', '0:123', '1:123', '0:50', '1:50']);
        expect(result.outcomes.every((d) => d === 'succeeded')).toBe(true);
        expect(result.stoppedAt).toBeNull();
    });

    it('hata verince "dur" politikasında sonrakileri çalıştırmaz', async () => {
        const request = baseRequest();
        let calls = 0;

        const result = await runTemplate(FULL, request, async () => {
            calls += 1;

            if (calls === 2) {
                request.log.addError('ModelIndexes düştü');
            }
        });

        expect(calls).toBe(2);
        expect(result.outcomes).toEqual(['succeeded', 'failed', 'skipped', 'skipped', 'skipped', 'skipped']);
        expect(result.stoppedAt).toBe(1);
    });

    it('"devam" politikasında hatadan sonra sürer', async () => {
        const template = {
            ...FULL,
            steps: [newStep({ start: '0', onError: 'continue' }), newStep({ start: '123' })],
        };
        let calls = 0;

        const result = await runTemplate(template, baseRequest(), async () => {
            calls += 1;

            if (calls === 1) {
                throw new Error('boom');
            }
        });

        expect(result.outcomes).toEqual(['failed', 'succeeded']);
    });

    it('durdurulunca kalan adımlar çalışmaz', async () => {
        const controller = new AbortController();
        let calls = 0;

        const result = await runTemplate(FULL, baseRequest(controller.signal), async () => {
            calls += 1;
            controller.abort();
        });

        expect(calls).toBe(1);
        expect(result.outcomes.slice(1).every((d) => d === 'skipped')).toBe(true);
    });
});
