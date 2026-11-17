/**
 * Şablon çalıştırıcı: adımları sırayla, mevcut `runOperation` ile koşturur.
 *
 * Adım hata verirse (günlükte hata satırı ya da hata sayacı) ve politika "dur" ise sonrakiler
 * çalışmaz; kullanıcı durdurursa (signal) kalan adımlar "atlandı" olur.
 * Adım yürütücüsü parametredir: testler gerçek sunucu olmadan sırayı ve politikayı doğrular.
 */

import { OPERATION_KINDS } from './adminOperations';
import type { OperationKind } from './adminOperations';
import type { OperationRequest } from './adminOperations';
import { describeStep } from './migrationTemplate';
import type { MigrationTemplate, TemplateStep } from './migrationTemplate';
import { emptyCounters } from './types';

export type StepOutcome = 'succeeded' | 'failed' | 'skipped';

export interface TemplateRunResult {
    outcomes: StepOutcome[];
    stoppedAt: number | null;
}

type StepExecutor = (kind: OperationKind, request: OperationRequest) => Promise<void>;

/** Şablon adımını mevcut işlem girdilerine çevirir. */
export function requestForStep(base: OperationRequest, step: TemplateStep): OperationRequest {
    const isDbt = step.kind === 'dbtMigrate';

    return {
        ...base,
        operationName: isDbt ? '1-Dbt-Migrate' : '0-Migrate',
        startText: step.start.trim(),
        endText: step.end.trim(),
        isBetweenMode: step.isRange,
        rangeParallel: step.parallel,
        rangeOrderByUsage: step.orderByUsage,
        dbtMigrationName: isDbt ? step.migrationName.trim() : base.dbtMigrationName,
    };
}

export function kindOfStep(step: TemplateStep): OperationKind {
    return step.kind === 'dbtMigrate' ? OPERATION_KINDS.dbtMigrate : OPERATION_KINDS.migrate;
}

export async function runTemplate(
    template: MigrationTemplate,
    base: OperationRequest,
    execute: StepExecutor,
): Promise<TemplateRunResult> {
    const { log, signal } = base;
    const outcomes: StepOutcome[] = template.steps.map(() => 'skipped');
    let stoppedAt: number | null = null;

    for (let i = 0; i < template.steps.length; i += 1) {
        const step = template.steps[i];

        if (signal.aborted) {
            log.addLine(`Durduruldu: ${i + 1}. adımdan itibaren çalıştırılmadı.`);
            stoppedAt = i;
            break;
        }

        log.addLine('');
        log.addLine(`=== Şablon adımı ${i + 1}/${template.steps.length}: ${describeStep(step)} ===`);

        // Sayaç adım başına sıfırlanır: bir önceki adımın hatası bu adıma yazılmasın.
        log.setCounters(emptyCounters());

        const errorsBefore = log.getSnapshot().errors.length;
        let threw = false;

        try {
            await execute(kindOfStep(step), requestForStep(base, step));
        } catch (error) {
            threw = true;
            log.addError(`Adım ${i + 1} beklenmedik hata: ${error instanceof Error ? error.message : String(error)}`);
        }

        log.flushNow();

        const snapshot = log.getSnapshot();
        const failed = threw || snapshot.counters.error > 0 || snapshot.errors.length > errorsBefore;

        if (signal.aborted && !failed) {
            outcomes[i] = 'skipped';
            stoppedAt = i;
            log.addLine(`Durduruldu: ${i + 1}. adım yarıda kaldı.`);
            break;
        }

        outcomes[i] = failed ? 'failed' : 'succeeded';

        if (failed) {
            if (step.onError === 'stop') {
                stoppedAt = i;
                log.addLine(`Adım ${i + 1} hatalı: şablon durdu, sonraki adımlar çalıştırılmadı.`);
                break;
            }

            log.addLine(`Adım ${i + 1} hatalı: politika gereği sonraki adımla devam ediliyor.`);
        }
    }

    const ok = outcomes.filter((d) => d === 'succeeded').length;
    const bad = outcomes.filter((d) => d === 'failed').length;

    log.addLine('');
    log.addLine(`Şablon bitti: ${ok} başarılı, ${bad} hatalı, ${outcomes.length - ok - bad} çalışmadı.`);
    log.setStatus(
        `Şablon: ${template.name} — ${ok}/${outcomes.length} adım başarılı`,
        bad > 0 || stoppedAt !== null ? 'failed' : 'succeeded',
    );
    log.flushNow();

    return { outcomes, stoppedAt };
}
