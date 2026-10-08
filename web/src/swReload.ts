/**
 * Yeni sürüm devralınca sayfayı bir kez yeniler.
 *
 * Neden gerekiyor: service worker uygulama kabuğunu önbelleğe alıyor. Yeni bir derleme
 * yayınlandığında ilk açılış hâlâ ESKİ kabuğu önbellekten servis ediyor; yeni sürüm ancak
 * bir sonraki açılışta görünüyordu. Ölçüldü (08.10.2026): deploy sonrası birinci yenileme
 * eski paketi, ikincisi yenisini yükledi.
 *
 * Bu, "değişikliği yaptım ama göremiyorum" şeklinde vakit kaybettiren bir davranış. Yeni
 * worker kontrolü devralır almaz (`controllerchange`) sayfa kendiliğinden yenilenince tek
 * yenileme yetiyor.
 *
 * Döngü koruması: bayrak sayesinde sayfa ömrü başına yalnız bir kez yenilenir.
 */
export function installServiceWorkerReload(): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return;
    }

    let hasReloaded = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hasReloaded) {
            return;
        }

        hasReloaded = true;
        window.location.reload();
    });
}
