import type { OperationCounters, OperationState } from './types';
import { emptyCounters } from './types';

/**
 * İşlem akışlarının sonuçlarını yazdığı hedef ve aynı anda React'in okuduğu store.
 *
 * Neden ayrı bir store: kuyruğa alma/izleme döngüleri saniyede onlarca satır üretebiliyor.
 * Her satırda setState çağırmak render fırtınası yaratır; bunun yerine mutasyonlar burada birikir
 * ve ekran ~200 ms'de bir toplu yenilenir (Blazor sürümünde de aynı yaklaşım kullanılmıştı).
 */

export interface LogSnapshot {
    version: number;
    lines: string[];
    errors: string[];
    /** Listelerin üstündeki işlem satırı (hangi url, hangi aşama). */
    operation: string;
    statusText: string;
    state: OperationState;
    counters: OperationCounters;
}

const FLUSH_INTERVAL_MS = 200;

export class OperationLog {
    private lines: string[] = [];
    private errors: string[] = [];
    private operation = '';
    private statusText = '';
    private state: OperationState = 'ready';
    private counters: OperationCounters = emptyCounters();

    private version = 0;
    private snapshot: LogSnapshot = this.build();
    private listeners = new Set<() => void>();
    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    // ---- React arayüzü ----

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    getSnapshot = (): LogSnapshot => this.snapshot;

    // ---- sink arayüzü (işlem akışları bunları çağırır) ----

    /** Tamamlananlar listesine satır ekler ve satırın indeksini döndürür. */
    addLine(text: string): number {
        this.lines.push(text);
        this.schedule();

        return this.lines.length - 1;
    }

    /** Daha önce eklenmiş satırı yerinde değiştirir ("kuyruğa alındı" → "tamamlandı"). */
    replaceLine(index: number, text: string): void {
        if (index < 0 || index >= this.lines.length) {
            return;
        }

        this.lines[index] = text;
        this.schedule();
    }

    addError(message: string): void {
        this.errors.push(message);
        this.schedule();
    }

    setOperation(text: string): void {
        this.operation = text;
        this.schedule();
    }

    setCounters(counters: OperationCounters): void {
        this.counters = { ...counters };
        this.schedule();
    }

    setStatus(text: string, state: OperationState): void {
        this.statusText = text;
        this.state = state;
        this.schedule();
    }

    reset(): void {
        this.lines = [];
        this.errors = [];
        this.operation = '';
        this.statusText = '';
        this.state = 'ready';
        this.counters = emptyCounters();

        this.flush();
    }

    /** Akış bittiğinde çağrılır: bekleyen toplu yenilemeyi hemen uygular. */
    flushNow(): void {
        this.flush();
    }

    // ---- iç işleyiş ----

    private schedule(): void {
        if (this.flushTimer !== null) {
            return;
        }

        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.flush();
        }, FLUSH_INTERVAL_MS);
    }

    private flush(): void {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        this.version += 1;
        this.snapshot = this.build();

        for (const listener of this.listeners) {
            listener();
        }
    }

    private build(): LogSnapshot {
        return {
            version: this.version,
            // Kopyalanıyor: React'in gördüğü dizi, akış sürerken mutasyona uğramasın.
            lines: [...this.lines],
            errors: [...this.errors],
            operation: this.operation,
            statusText: this.statusText,
            state: this.state,
            counters: { ...this.counters },
        };
    }
}
