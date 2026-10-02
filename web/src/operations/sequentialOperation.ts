import type { OperationLog } from './operationLog';
import type { OperationCounters } from './types';

/**
 * Kuyruk gerektirmeyen (senkron uçlu) akışların ortak başlangıç/bitiş blokları.
 *
 * `0-Migrate` ve `1-Dbt-Migrate` sunucuda Hangfire işi açar ve durum izlenir; `2-Function Renew`
 * ile `6-Update SalerId` ise doğrudan senkron uca gider, yani izlenecek bir jobId yoktur.
 */

export function beginSequential(log: OperationLog, operationName: string, headerText: string): void {
    log.setStatus(`${operationName} - Başladı`, 'running');

    log.addLine('         *********************      ');
    log.addLine(`              Başladı - ${headerText}`);
    log.addLine('         *********************      ');
}

export function finishSequential(log: OperationLog, operationName: string, counters: OperationCounters): void {
    log.addLine('         *********************      ');
    log.addLine(`              Tamamlandı - Başarılı: ${counters.success} - Hatalı: ${counters.error}`);
    log.addLine('         *********************      ');
    log.addLine('         ');

    counters.pending = 0;
    log.setCounters(counters);

    log.setOperation(`${operationName} - Tamamlandı | Başarılı: ${counters.success} | Hatalı: ${counters.error}`);

    log.setStatus(`${operationName} - Tamamlandı`, counters.error > 0 ? 'failed' : 'succeeded');
    log.flushNow();
}

/** Hedef bulunamadığında ortak çıkış. */
export function reportNoTargets(log: OperationLog, operationName: string): void {
    log.addLine('         işlenecek veritabanı bulunamadı - Start kutusunu kontrol edin (0 = Dbt_Temp)');
    log.setStatus(`${operationName} - işlenecek veritabanı bulunamadı`, 'failed');
    log.flushNow();
}

/**
 * Yanıtın başarı sayılıp sayılmayacağı.
 *
 * WPF sürümü gövdede ham metin olarak `"isOk": true,` arıyordu; yanıt biçimi değişince
 * (boşluksuz JSON ya da alanın sonda olması) her paket hatalı görünürdü. Burada önce alan
 * olarak okunur, çözülemezse eski metin kontrolüne düşülür.
 */
export function isOkResponse(content: string): boolean {
    if (!content.trim()) {
        return false;
    }

    try {
        const parsed: unknown = JSON.parse(content);

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
                if (key.toLowerCase() === 'isok') {
                    return value === true;
                }
            }
        }
    } catch {
        // Gövde JSON değil — eski metin kontrolüne düşülür.
    }

    return content.includes('"isOk": true,');
}
