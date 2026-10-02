import { useState } from 'react';
import { buildStamp } from '../buildInfo';
import type { FormEvent } from 'react';
import { EnvSelector } from '../components/EnvSelector';
import { ENV_ACCENT } from '../components/envAccent';
import { isBlockedByMixedContent } from '../config/environments';
import { useAuth } from './useAuth';
import { loadLastLoginName } from './session';

/**
 * Giriş ekranı.
 *
 * Ortam seçimi bilerek BURADA: Login.Api ortama göre değişiyor (Local/Test → login-test,
 * Prod → login.unideva.com), yani hangi ortama girileceği kimlik doğrulamadan önce belli olmalı.
 */
export function LoginScreen() {
    const { environment, selectEnvironment, signIn } = useAuth();

    const [loginName, setLoginName] = useState(loadLastLoginName);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isBusy, setIsBusy] = useState(false);

    const accent = ENV_ACCENT[environment.key];
    const isMixedContentBlocked = isBlockedByMixedContent(environment);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();

        if (isBusy) {
            return;
        }

        setError('');
        setIsBusy(true);

        try {
            const failure = await signIn(loginName, password);

            if (failure) {
                setError(failure);
                setPassword('');
            }
        } finally {
            setIsBusy(false);
        }
    }

    return (
        <div className="flex min-h-full items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
            <div className="w-full max-w-md">
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                        Dbt Admin Console
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Paket veritabanı migration ve bakım işlemleri
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Ortam
                    </label>

                    <EnvSelector value={environment.key} onChange={selectEnvironment} disabled={isBusy} />

                    {environment.requiresConfirmation && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                            <strong className="font-semibold">Prod ortamı.</strong> Burada başlatılan işlemlerin
                            geri dönüşü yoktur. Oturum 12 saat sonra düşer.
                        </div>
                    )}

                    {isMixedContentBlocked && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            Konsol https üzerinden açıldı, bu ortamın servisi ise http. Tarayıcı çağrıları
                            engelleyecek — konsolu http üzerinden açın.
                        </div>
                    )}

                    <div className="mt-5 space-y-4">
                        <div>
                            <label
                                htmlFor="loginName"
                                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
                            >
                                Kullanıcı adı ya da e-posta
                            </label>
                            <input
                                id="loginName"
                                type="text"
                                autoComplete="username"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                value={loginName}
                                disabled={isBusy}
                                onChange={(e) => setLoginName(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
                            >
                                Şifre
                            </label>
                            <input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                disabled={isBusy}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800"
                            />
                        </div>
                    </div>

                    {error && (
                        <p
                            role="alert"
                            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                        >
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={isBusy}
                        className={[
                            'mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition',
                            'disabled:cursor-not-allowed disabled:opacity-60',
                            accent.chip,
                        ].join(' ')}
                    >
                        {isBusy ? 'Giriş yapılıyor…' : `${environment.name} ortamına giriş`}
                    </button>

                    <p className="mt-4 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
                        Kimlik <span className="font-mono">{environment.loginApiBaseUrl}</span> üzerinden
                        doğrulanır.
                        <br />
                        Oturum bu cihazda saklanır; şifreniz saklanmaz.
                    </p>
                </form>

                <p className="mt-4 text-center font-mono text-[11px] text-slate-400 dark:text-slate-600">
                    {buildStamp()}
                </p>
            </div>
        </div>
    );
}
