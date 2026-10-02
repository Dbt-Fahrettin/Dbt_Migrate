import { useSyncExternalStore } from 'react';
import type { LogSnapshot, OperationLog } from '../../operations/operationLog';

/**
 * OperationLog'u React'e bağlar.
 *
 * Store kendi içinde ~200 ms'de bir toplu yenileme yapar; burada yalnız abone olunur.
 * Satır başına setState çağırsaydık binlerce paketlik akışta render fırtınası çıkardı.
 */
export function useOperationLog(log: OperationLog): LogSnapshot {
    return useSyncExternalStore(log.subscribe, log.getSnapshot, log.getSnapshot);
}
