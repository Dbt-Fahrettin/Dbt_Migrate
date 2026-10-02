import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { login } from '../api/loginClient';
import type { EnvKey } from '../config/environments';
import { getEnvironment, resolveEnvKey } from '../config/environments';
import { isNativeApp } from '../config/platform';
import { AuthContext } from './authContext';
import type { AuthState, AuthStatus } from './authContext';
import { authorize } from './authorize';
import {
    clearSession,
    loadLastEnvKey,
    loadSession,
    saveLastEnvKey,
    saveLastLoginName,
    saveSession,
} from './session';
import type { LoginResponse } from './types';

function readInitialEnvKey(): EnvKey {
    // Kayıtlı ortam bu cihazda kullanılamıyorsa (native pakette Local) varsayılana düşülür.
    return resolveEnvKey(loadLastEnvKey(), isNativeApp());
}

/**
 * Oturum durumu.
 *
 * Açılış sırası: son kullanılan ortam okunur → o ortamın Login.Api'si için kayıtlı oturum
 * aranır → bulunursa yetki kuralı TEKRAR uygulanır → geçerse konsol, aksi halde giriş ekranı.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [envKey, setEnvKey] = useState<EnvKey>(readInitialEnvKey);
    const [user, setUser] = useState<LoginResponse | null>(null);
    const [status, setStatus] = useState<AuthStatus>('restoring');

    const environment = useMemo(() => getEnvironment(envKey), [envKey]);

    /** Verilen ortam için kayıtlı oturumu dener; başarılıysa kullanıcıyı döndürür. */
    const restoreFor = useCallback((key: EnvKey): LoginResponse | null => {
        const env = getEnvironment(key);
        const stored = loadSession(env.loginApiBaseUrl);

        if (!stored) {
            return null;
        }

        // Yetki kuralı yapılandırmadan geliyor; daraltıldıysa bayat oturum burada düşer.
        if (authorize(stored) !== null) {
            clearSession(env.loginApiBaseUrl);

            return null;
        }

        return stored;
    }, []);

    useEffect(() => {
        const restored = restoreFor(envKey);

        setUser(restored);
        setStatus(restored ? 'authenticated' : 'anonymous');
        // Yalnız ilk açılışta koşar; ortam değişimi selectEnvironment üzerinden yönetilir.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectEnvironment = useCallback(
        (key: EnvKey) => {
            setEnvKey(key);
            saveLastEnvKey(key);

            const restored = restoreFor(key);

            setUser(restored);
            setStatus(restored ? 'authenticated' : 'anonymous');
        },
        [restoreFor],
    );

    const signIn = useCallback(
        async (loginNameOrEmail: string, password: string): Promise<string | null> => {
            if (!loginNameOrEmail.trim()) {
                return 'Login adı ya da mail boş olamaz!';
            }

            if (!password) {
                return 'Şifre boş olamaz!';
            }

            const env = getEnvironment(envKey);
            const result = await login(env.loginApiBaseUrl, loginNameOrEmail, password);

            if (!result.isSuccess || !result.user) {
                return result.message;
            }

            const authorizationError = authorize(result.user);

            if (authorizationError !== null) {
                return authorizationError;
            }

            saveSession(env.loginApiBaseUrl, result.user, env.sessionTtlHours);
            saveLastEnvKey(env.key);
            saveLastLoginName(loginNameOrEmail.trim());

            setUser(result.user);
            setStatus('authenticated');

            return null;
        },
        [envKey],
    );

    const signOut = useCallback(() => {
        clearSession(getEnvironment(envKey).loginApiBaseUrl);

        setUser(null);
        setStatus('anonymous');
    }, [envKey]);

    const value: AuthState = useMemo(
        () => ({ status, environment, user, selectEnvironment, signIn, signOut }),
        [status, environment, user, selectEnvironment, signIn, signOut],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
