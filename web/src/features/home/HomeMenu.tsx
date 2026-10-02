import type { ReactNode } from 'react';
import { useAuth } from '../../auth/useAuth';
import { fullName } from '../../auth/types';
import type { AppView } from '../../navigation';

/**
 * Giriş sonrası menü: hangi bölüme gidileceği burada seçilir.
 *
 * Kartlar bilerek büyük ve tek sütuna düşebilir durumda — bu ekran telefonda da kullanılıyor
 * ve dokunma hedefi küçük olursa yanlış bölüme girmek kolaylaşır.
 */

interface Props {
    onSelect: (view: AppView) => void;
}

export function HomeMenu({ onSelect }: Props) {
    const { user, environment } = useAuth();

    return (
        <div className="safe-x safe-bottom mx-auto max-w-4xl pt-6">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                {user ? `Merhaba, ${fullName(user)}` : 'Dbt Admin Console'}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                <span className="font-medium">{environment.name}</span> ortamında çalışıyorsunuz. Hangi bölüme
                gitmek istersiniz?
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <MenuCard
                    title="Migration İşlemleri"
                    description="Paket veritabanlarında migration çalıştırma, fonksiyon yenileme ve migration geçmişi."
                    bullets={[
                        '0-Migrate · 1-Dbt-Migrate',
                        '2-Function Renew · 6-Update SalerId',
                        '7-Geçmiş · 8-Takip',
                    ]}
                    accent="text-sky-600 dark:text-sky-400"
                    icon={<DatabaseIcon />}
                    onClick={() => onSelect('migration')}
                />

                <MenuCard
                    title="GİB API İşlemleri"
                    description="Gib.Api gece sorgulama servisinin durumunu görüntüleme ve açıp kapatma."
                    bullets={['Durum kontrolü', 'Gece servisini aç', 'Gece servisini kapat']}
                    accent="text-emerald-600 dark:text-emerald-400"
                    icon={<InvoiceIcon />}
                    onClick={() => onSelect('gib')}
                />
            </div>
        </div>
    );
}

interface CardProps {
    title: string;
    description: string;
    bullets: string[];
    accent: string;
    icon: ReactNode;
    onClick: () => void;
}

function MenuCard({ title, description, bullets, accent, icon, onClick }: CardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
        >
            <span className={`${accent}`}>{icon}</span>

            <span className="mt-3 text-base font-bold text-slate-900 dark:text-slate-50">{title}</span>

            <span className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</span>

            <ul className="mt-3 space-y-1">
                {bullets.map((bullet) => (
                    <li key={bullet} className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {bullet}
                    </li>
                ))}
            </ul>

            <span className={`mt-4 text-sm font-semibold ${accent}`}>Aç →</span>
        </button>
    );
}

function DatabaseIcon() {
    return (
        <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
        >
            <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
            <path d="M4.5 5.5v13c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-13" />
            <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
        </svg>
    );
}

function InvoiceIcon() {
    return (
        <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
        >
            <path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2v-19z" />
            <path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round" />
        </svg>
    );
}
