import { createContext } from 'react';
import type { EnvKey, ServiceEnvironment } from '../config/environments';
import type { LoginResponse } from './types';

export type AuthStatus = 'restoring' | 'anonymous' | 'authenticated';

export interface AuthState {
    status: AuthStatus;

    /** Seçili ortam — giriş ekranında da konsol içinde de bu geçerlidir. */
    environment: ServiceEnvironment;

    /** Giriş yapmış kullanıcı; yoksa null. */
    user: LoginResponse | null;

    /**
     * Ortamı değiştirir. Hedef ortamın Login.Api'si için geçerli bir oturum varsa
     * doğrudan geçilir; yoksa giriş ekranına düşülür (Test ↔ Prod arası her zaman böyledir).
     */
    selectEnvironment: (key: EnvKey) => void;

    signIn: (loginNameOrEmail: string, password: string) => Promise<string | null>;

    signOut: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);
