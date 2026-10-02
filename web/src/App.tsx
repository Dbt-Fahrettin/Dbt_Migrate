import { useState } from 'react';
import { LoginScreen } from './auth/LoginScreen';
import { useAuth } from './auth/useAuth';
import { AppHeader } from './components/AppHeader';
import { ConsolePage } from './features/console/ConsolePage';
import { GibNightlyPage } from './features/gib/GibNightlyPage';
import { HomeMenu } from './features/home/HomeMenu';
import type { AppView } from './navigation';

export default function App() {
    const { status, environment } = useAuth();

    const [view, setView] = useState<AppView>('menu');

    if (status === 'restoring') {
        return (
            <div className="flex min-h-full items-center justify-center bg-slate-50 dark:bg-slate-950">
                <p className="text-sm text-slate-500 dark:text-slate-400">Oturum kontrol ediliyor…</p>
            </div>
        );
    }

    if (status === 'anonymous') {
        return <LoginScreen />;
    }

    // 100dvh: mobil tarayıcıda 100vh, adres çubuğu gizlenip görününce yanlış ölçülür.
    // Migration ekranı lg üstünde iki kolon olarak ekrana sığar ve yalnız iç alanları kayar;
    // menü ve GİB ekranı kısa olduğu için ana alanın kendisi kayar.
    return (
        <div className="flex h-[100dvh] flex-col bg-slate-50 dark:bg-slate-950">
            <AppHeader view={view} onBack={() => setView('menu')} />

            <main
                className={[
                    'min-h-0 flex-1 overflow-y-auto',
                    view === 'migration' ? 'lg:overflow-hidden' : '',
                ].join(' ')}
            >
                {view === 'menu' && <HomeMenu onSelect={setView} />}

                {/*
                    key: ortam değişince konsol tümüyle yeniden kurulur — çekilmiş db adları, Dbt
                    migration listesi, form ve log sıfırlanır. WPF bunu yapmıyordu: Test'ten çekilmiş
                    ad listesiyle Prod'da koşmak var olan paketleri sessizce atlıyor, başka ortamın
                    migration adı gönderilebiliyordu.
                */}
                {view === 'migration' && <ConsolePage key={environment.key} />}

                {view === 'gib' && <GibNightlyPage key={environment.key} />}
            </main>
        </div>
    );
}
