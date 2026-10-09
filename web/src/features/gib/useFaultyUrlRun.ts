import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaultyUrlHostSummary } from '../../api/gibFaultyUrl';
import { loadSnapshot, runDiagnosisLoop, saveSnapshot, toSnapshot } from './faultyUrlReport';
import type { DiagnosisHostRow, DiagnosisRun, DiagnosisRunState, DiagnosisSnapshot } from './faultyUrlReport';

/**
 * `runDiagnosisLoop`'u React'e bağlar; döngü ve rapor kuralları faultyUrlReport.ts'te.
 *
 * Koşu **tamamlandığında** domain kararları tarayıcıya yazılır; bir sonraki koşunun raporu bunlarla
 * karşılaştırılır. Yarıda kalan koşu yazılmaz: eksik bir özet sonraki raporda domainleri "yeni" gösterirdi.
 */
export interface UseFaultyUrlRun {
    state: DiagnosisRunState;
    run: DiagnosisRun | null;
    /** Bu koşu başlarken okunan önceki tam koşu. */
    previous: DiagnosisSnapshot | null;
    error: string;
    start: (hosts: FaultyUrlHostSummary[], sampleCount: number, concurrency: number) => void;
    stop: () => void;
    reset: () => void;
}

export function useFaultyUrlRun(
    gibApiBaseUrl: string,
    token: string | null | undefined,
    environmentKey: string,
): UseFaultyUrlRun {
    const [state, setState] = useState<DiagnosisRunState>('idle');
    const [run, setRun] = useState<DiagnosisRun | null>(null);
    const [previous, setPrevious] = useState<DiagnosisSnapshot | null>(() => loadSnapshot(environmentKey));
    const [error, setError] = useState('');

    const stopRef = useRef(false);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
            // Ekrandan çıkılırsa yeni domain başlatılmaz; koşan çağrılar sunucuda kendi bütçesinde biter.
            stopRef.current = true;
        };
    }, []);

    const stop = useCallback(() => {
        stopRef.current = true;
    }, []);

    const reset = useCallback(() => {
        stopRef.current = false;
        setState('idle');
        setRun(null);
        setError('');
        setPrevious(loadSnapshot(environmentKey));
    }, [environmentKey]);

    const start = useCallback(
        (hosts: FaultyUrlHostSummary[], sampleCount: number, concurrency: number) => {
            stopRef.current = false;
            setError('');
            setState('running');
            setPrevious(loadSnapshot(environmentKey));

            const rows: DiagnosisHostRow[] = [];
            const current: DiagnosisRun = {
                environmentKey,
                startedAt: new Date().toISOString(),
                finishedAt: '',
                sampleCount,
                plannedHostCount: hosts.length,
                rows,
            };

            setRun({ ...current, rows: [] });

            void runDiagnosisLoop({
                gibApiBaseUrl,
                token,
                hosts,
                sampleCount,
                concurrency,
                shouldStop: () => stopRef.current,
                onRow: (row) => {
                    rows.push(row);

                    if (isMountedRef.current) {
                        setRun({ ...current, rows: [...rows] });
                    }
                },
                onError: (message) => {
                    if (isMountedRef.current) {
                        setError(message);
                    }
                },
            }).then((finalState) => {
                const finished: DiagnosisRun = { ...current, finishedAt: new Date().toISOString(), rows: [...rows] };

                if (finalState === 'done') {
                    saveSnapshot(environmentKey, toSnapshot(finished));
                }

                if (isMountedRef.current) {
                    setRun(finished);
                    setState(finalState);
                }
            });
        },
        [gibApiBaseUrl, token, environmentKey],
    );

    return { state, run, previous, error, start, stop, reset };
}
