import { Capacitor } from '@capacitor/core';

/**
 * Uygulamanın nerede koştuğu.
 *
 * Native paket (Capacitor/Android) ile tarayıcı arasındaki tek davranış farkı şimdilik ortam
 * listesi: `Local` (http://localhost:44305) telefondan erişilemez, o yüzden native pakette gizlenir.
 *
 * Not: native pakette ağ çağrıları `CapacitorHttp` üzerinden native katmana gider (bkz.
 * capacitor.config.ts), yani CORS ve mixed-content kısıtları uygulanmaz. Tarayıcıda ikisi de geçerli.
 */
export function isNativeApp(): boolean {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
}

/** 'android' | 'ios' | 'web' */
export function platformName(): string {
    try {
        return Capacitor.getPlatform();
    } catch {
        return 'web';
    }
}
