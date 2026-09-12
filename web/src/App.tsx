import { LoginScreen } from './auth/LoginScreen';
import { useAuth } from './auth/useAuth';
import { AppHeader } from './components/AppHeader';
import { ConsolePage } from './features/console/ConsolePage';

export default function App() {
    const { status, environment } = useAuth();

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
    // Ana alan lg altında kendi kayar (form + log alt alta), lg üstünde iki kolon ekrana sığar
    // ve yalnız iç alanlar kayar.
    return (
        <div className="flex h-[100dvh] flex-col bg-slate-50 dark:bg-slate-950">
            <AppHeader />

            {/*
                key: ortam değişince konsol tümüyle yeniden kurulur — çekilmiş db adları, Dbt
                migration listesi, form ve log sıfırlanır. WPF bunu yapmıyordu: Test'ten çekilmiş
                ad listesiyle Prod'da koşmak var olan paketleri sessizce atlıyor, başka ortamın
                migration adı gönderilebiliyordu.
            */}
            <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
                <ConsolePage key={environment.key} />
            </main>
        </div>
    );
}
