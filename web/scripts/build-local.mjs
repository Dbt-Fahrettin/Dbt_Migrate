/**
 * Lokal kurulum için derleme: çıktı `/admin-console` alt yolu altında çalışacak şekilde kurulur.
 *
 * Neden ayrı script: `APP_BASE=/admin-console/ npm run build` Windows cmd/PowerShell'de
 * çalışmaz (satır içi ortam değişkeni yok). cross-env bağımlılığı eklemek yerine derlemeyi
 * buradan başlatıyoruz.
 *
 * Çıktı `dist/` DEĞİL **`dist-local/`**. Gerekçe: `npm run release` (APK ve normal web yayını)
 * `dist/` üretiyor ve base'i `/`. İkisi aynı klasörü paylaşsaydı biri diğerini ezerdi — APK
 * derlendikten sonra lokal sunucu kök tabanlı bir çıktıyı alt yoldan servis etmeye çalışır ve
 * uygulama bembeyaz açılırdı.
 *
 * DİKKAT: bu çıktı APK'ye KONULMAZ. Capacitor WebView'da dosyaları kök dizinden servis eder;
 * alt yollu bir derleme orada açılmaz. APK için her zaman `npm run release`.
 */

import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const base = process.env.APP_BASE || '/admin-console/';

console.log(`Lokal derleme — base: ${base}, çıktı: dist-local\n`);

execSync('npx tsc -b', { cwd: root, stdio: 'inherit' });

execSync('npx vite build --outDir dist-local --emptyOutDir', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, APP_BASE: base },
});

console.log(`\nHazır. Servis: npm run serve:local  →  http://localhost${base}`);
