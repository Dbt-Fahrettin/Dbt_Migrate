import { useCallback, useEffect, useRef, useState } from 'react';
import type { PackRequeryRequest } from '../../api/gibRequery';
import { runRequeryLoop } from './requeryLoop';
import type { RequeryProgress, RunState } from './requeryLoop';

/**
 * `runRequeryLoop`'u React'e bağlar. Döngünün kendisi requeryLoop.ts'te — orada React yok,
 * bu yüzden kurallar (yeniden deneme sınırı, ilerleme biriktirme) DOM'suz testleniyor.
 */
export interface UseRequeryRun {
    state: RunState;
    progress: RequeryProgress | null;
    error: string;
    start: (request: PackRequeryRequest) => void;
    stop: () => void;
    reset: () => void;
}

export function useRequeryRun(gibApiBaseUrl: string, token: string | null | undefined): UseRequeryRun {
    const [state, setState] = useState<RunState>('idle');
    const [progress, setProgress] = useState<RequeryProgress | null>(null);
    const [error, setError] = useState('');

    /** "Durdur" isteği: koşan çağrı bitirilir, yeni çağrı açılmaz. */
    const stopRef = useRef(false);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
            // Ekrandan çıkılırsa döngü de sonlansın; sunucuda koşan çağrı kendi bütçesinde biter.
            stopRef.current = true;
        };
    }, []);

    const stop = useCallback(() => {
        stopRef.current = true;
    }, []);

    const reset = useCallback(() => {
        stopRef.current = false;
        setState('idle');
        setProgress(null);
        setError('');
    }, []);

    const start = useCallback(
        (request: PackRequeryRequest) => {
            stopRef.current = false;
            setError('');
            setState('running');

            void runRequeryLoop({
                gibApiBaseUrl,
                token,
                request,
                shouldStop: () => stopRef.current,
                onProgress: (next) => {
                    if (isMountedRef.current) {
                        setProgress(next);
                    }
                },
                onError: (message) => {
                    if (isMountedRef.current) {
                        setError(message);
                    }
                },
            }).then((finalState) => {
                if (isMountedRef.current) {
                    setState(finalState);
                }
            });
        },
        [gibApiBaseUrl, token],
    );

    return { state, progress, error, start, stop, reset };
}
