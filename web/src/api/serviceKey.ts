/**
 * Bakım uçlarının servis anahtarı (`X-Svc-Key`).
 *
 * Service.Api'nin `MasterController`'ı ve `dbtRenewal/updateSalerPackCompanies` ucu 13.10.2026'dan
 * beri `[ServiceKeyRequired]` taşıyor (unideva 41dedbbb9f). O filtre anahtar eksik ya da yanlışsa
 * **404** döner — ucun varlığını tarayan birine açık etmemek için bilerek böyle. Yani konsolda
 * beklenmedik bir 404 görüldüğünde ilk bakılacak yer burasıdır; "uç yok" demek değildir.
 * Sunucuda anahtar `ServiceKeys:Admin` (k8s: `und-api-secret` → `und-admin-service-key`).
 *
 * NEDEN PAKETE GÖMÜLMÜYOR: bu anahtar canlı veritabanlarında migration koşturur ve satışçı
 * atamalarını değiştirir. Derleme sırasında gömülseydi hem tarayıcı paketinde hem telefonlardaki
 * APK'de açıkta dururdu — APK'yi eline geçiren herkes bu işleri çalıştırabilirdi. Bunun yerine
 * kullanıcı anahtarı bir kez yapıştırır; değer yalnız o cihazın localStorage'ında kalır, depoya
 * ve pakete hiç girmez.
 *
 * Anahtar ORTAMA göre ayrı saklanır: Test ve Prod'un anahtarları farklıdır. Oturumda olduğu gibi
 * ayraç ortam adı değil api adresidir — aynı adresi kullanan ortamlar anahtarı paylaşsın.
 *
 * Bu bir güvenlik sınırı değildir: cihaza erişen biri anahtarı okuyabilir. Sınır sunucudadır;
 * burada amaç anahtarın dağıtılan pakete girmemesi.
 */

const STORAGE_PREFIX = 'dbt-admin-svc-key:';

/** Sunucunun "tanımsız" saydığı uzunluk (ServiceKeyRequiredAttribute.MinKeyLength). */
const MIN_KEY_LENGTH = 16;

export const SERVICE_KEY_HEADER = 'X-Svc-Key';

function storageKey(apiBaseUrl: string): string {
    return `${STORAGE_PREFIX}${apiBaseUrl}`;
}

/**
 * localStorage her bağlamda yok: testler node'da koşar, gizli pencerede ve site verisi kapalıyken
 * erişim hata fırlatır. Hiçbiri anahtarsız çalışmayı engellememeli.
 */
function storage(): Storage | null {
    try {
        if (typeof window === 'undefined' || !window.localStorage) {
            return null;
        }

        return window.localStorage;
    } catch {
        return null;
    }
}

export function loadServiceKey(apiBaseUrl: string): string {
    try {
        return storage()?.getItem(storageKey(apiBaseUrl))?.trim() ?? '';
    } catch {
        return '';
    }
}

/** Boş değer anahtarı siler — kullanıcı alanı temizleyince kayıt da kalmasın. */
export function saveServiceKey(apiBaseUrl: string, key: string): void {
    const trimmed = key.trim();

    try {
        if (!trimmed) {
            storage()?.removeItem(storageKey(apiBaseUrl));

            return;
        }

        storage()?.setItem(storageKey(apiBaseUrl), trimmed);
    } catch {
        /* yok sayılır — anahtar yalnız bu sekme boyunca yaşar */
    }
}

/**
 * Anahtar sunucunun kabul edebileceği uzunlukta mı. Kısa anahtarı sunucu "tanımsız" sayıp 404
 * döndüğü için, yapıştırırken yarım kalan bir değeri ekranda erkenden söyleyebilmek adına burada.
 * Doğruluğunu söylemez — onu yalnız sunucu bilir.
 */
export function isPlausibleServiceKey(key: string): boolean {
    return key.trim().length >= MIN_KEY_LENGTH;
}

/**
 * Servis anahtarı gerektiren uçların başlıkları. Anahtar yoksa boş nesne döner: istek yine gider
 * ve sunucudan 404 alınır. Bilerek — "anahtar yok" diye çağrıyı burada engellemek, sunucu bir gün
 * anahtarı kaldırdığında konsolu sebepsiz kilitlerdi.
 */
export function serviceKeyHeaders(apiBaseUrl: string): Record<string, string> {
    const key = loadServiceKey(apiBaseUrl);

    return key ? { [SERVICE_KEY_HEADER]: key } : {};
}
