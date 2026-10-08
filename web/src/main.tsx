import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import App from './App.tsx'
import { installServiceWorkerReload } from './swReload';
import './index.css'

// Yeni derleme yayinlandiginda tek yenilemede devreye girsin (bkz. swReload.ts).
installServiceWorkerReload();

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Konsoldaki listeler (veritabanı adları, migration adları) ortama özeldir ve
            // elle "getir" düğmeleriyle çekilir; arka planda kendiliğinden yenilenmesini istemiyoruz.
            refetchOnWindowFocus: false,
            retry: false,
        },
    },
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <App />
            </AuthProvider>
        </QueryClientProvider>
    </StrictMode>,
);
