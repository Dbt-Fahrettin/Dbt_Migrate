import { useAuth } from '../auth/useAuth';
import { fullName, roleName } from '../auth/types';
import { EnvSelector } from './EnvSelector';
import { ENV_ACCENT } from './envAccent';

/**
 * Üst şerit. Ortam adı ve rengi her zaman görünür: bu araçtaki en büyük operasyonel risk
 * yanlış ortamda işlem başlatmak, ve Prod'un kırmızı olması bunu tek bakışta veriyor.
 */
export function AppHeader() {
    const { environment, selectEnvironment, user, signOut } = useAuth();

    const accent = ENV_ACCENT[environment.key];

    return (
        <header
            className={[
                'safe-top shrink-0 border-b bg-white dark:bg-slate-900',
                environment.requiresConfirmation
                    ? 'border-red-300 dark:border-red-900'
                    : 'border-slate-200 dark:border-slate-800',
            ].join(' ')}
        >
            {environment.requiresConfirmation && <div className="h-1 w-full bg-red-600" />}

            {/*
                Telefonda iki satır: üstte ad + kullanıcı + çıkış, altta tam genişlik ortam seçici.
                sm üstünde hepsi tek satıra çıkar. Ortam seçicinin dokunma hedefi dar ekranda
                küçülmesin diye alt satırda tam genişlik veriliyor.
            */}
            <div className="safe-x mx-auto max-w-6xl py-3">
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent.dot}`} />
                        <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
                            Dbt Admin Console
                        </span>
                    </div>

                    <div className="ml-auto hidden w-56 shrink-0 sm:block">
                        <EnvSelector value={environment.key} onChange={selectEnvironment} />
                    </div>

                    {user && (
                        <div className="ml-auto min-w-0 text-right sm:ml-0">
                            <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                {fullName(user)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{roleName(user.rl)}</div>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={signOut}
                        className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        Çıkış
                    </button>
                </div>

                <div className="mt-3 sm:hidden">
                    <EnvSelector value={environment.key} onChange={selectEnvironment} />
                </div>
            </div>
        </header>
    );
}
