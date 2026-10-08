import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Yapı damgası: sürüm + commit + derleme zamanı.
 *
 * Ekranda görünür olması bilinçli. Bu araç birden fazla yerden kullanılıyor (tarayıcı, kurulu PWA,
 * APK) ve her biri farklı bir sürümde takılı kalabiliyor — "hangi build'desiniz?" sorusunun
 * cevabı ekranda yazmalı, yoksa destek konuşması tahminle ilerliyor.
 */
const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

function gitSha(): string {
  // Docker imajında .git yok; CI/derleme ortamı sha'yı ortam değişkeniyle geçirir.
  if (process.env.GIT_SHA) {
    return process.env.GIT_SHA.trim()
  }

  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    // Depo dışına kopyalanmış bir kaynaktan derleniyor olabilir; damga yine de üretilsin.
    return 'bilinmiyor'
  }
}

/**
 * Yayın kökü.
 *
 * Varsayılan `/` — hem normal web yayını hem de **APK** böyle çalışır: Capacitor, WebView içinde
 * dosyaları kök dizinden servis eder, alt yol verilirse index.html olmayan adreslere bakar ve
 * uygulama bembeyaz açılır.
 *
 * Alt yol altında yayınlamak için derlerken APP_BASE verilir, ör. lokal kurulum:
 *   APP_BASE=/admin-console/ npm run build      (npm run build:local bunu yapar)
 *
 * Sonunda / olmalı; Vite varlık adreslerini ve PWA manifest kapsamını buna göre kurar.
 */
const appBase = process.env.APP_BASE || '/'

// https://vite.dev/config/
export default defineConfig({
  base: appBase,
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
    __GIT_SHA__: JSON.stringify(gitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    /**
     * PWA: Windows'ta Chrome/Edge ile "kur" denince kendi penceresinde açılır, iOS'ta Safari'den
     * "Ana Ekrana Ekle" ile tam ekran uygulama gibi durur. iOS için native paket yerine bu yol
     * seçildi (bkz. README).
     *
     * Önbellek stratejisi bilerek dar: yalnız uygulama kabuğu (JS/CSS/ikon) önbelleğe alınır.
     * Service.Api ve Login.Api çağrıları ASLA önbelleğe alınmaz — bir yönetim aracında bayat
     * migration durumu göstermek, hiç göstermemekten kötüdür.
     */
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Dbt Admin Console',
        short_name: 'Dbt Admin',
        description: 'Dbt paket veritabanı migration ve bakım işlemleri',
        lang: 'tr',
        // Alt yol altında yayınlanınca kurulu uygulama da o yoldan açılmalı.
        start_url: appBase,
        scope: appBase,
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Uygulama kabuğu dışında hiçbir şey önbelleğe alınmaz; api çağrıları ağa gider.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    // Telefondan aynı ağdaki dev sunucusuna bakabilmek için.
    host: true,
  },
})
