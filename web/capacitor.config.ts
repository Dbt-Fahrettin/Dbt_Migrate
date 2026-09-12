import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android paketi.
 *
 * iOS platformu bilerek eklenmedi: uygulama hiçbir native yetenek kullanmıyor (kamera, dosya,
 * bildirim yok), buna karşılık native iOS dağıtımı Mac + Xcode + Apple Developer hesabı ve
 * 90 günlük/yıllık yenileme döngüsü demek. iOS'ta Safari'den "Ana Ekrana Ekle" (PWA) aynı işi
 * bedelsiz görüyor — bkz. README.
 */
const config: CapacitorConfig = {
    appId: 'com.devatek.dbtadmin',
    appName: 'Dbt Admin Console',
    webDir: 'dist',

    plugins: {
        /**
         * fetch/XHR çağrılarını native HTTP katmanına yönlendirir.
         *
         * İki kazancı var: (1) WebView'ın CORS kısıtları uygulanmaz, yani Service.Api'de CORS
         * bir gün daraltılsa bile mobil taraf etkilenmez; (2) mixed-content engeli yoktur.
         */
        CapacitorHttp: {
            enabled: true,
        },
    },

    android: {
        /**
         * Cleartext (http) trafiğe izin YOK.
         *
         * Gerek de yok: native pakette yalnız Test ve Prod görünür, ikisi de https.
         * `Local` (http://localhost:44305) telefondan zaten erişilemediği için gizleniyor
         * (bkz. src/config/platform.ts). Bir gün http bir ortam eklenirse, topyekûn açmak
         * yerine yalnız o host için network_security_config.xml istisnası yazın.
         */
        allowMixedContent: false,
    },
};

export default config;
