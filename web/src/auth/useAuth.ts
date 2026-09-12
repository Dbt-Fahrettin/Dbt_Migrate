import { useContext } from 'react';
import { AuthContext } from './authContext';
import type { AuthState } from './authContext';

export function useAuth(): AuthState {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth, AuthProvider içinde kullanılmalı.');
    }

    return context;
}
