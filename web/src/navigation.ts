/**
 * Uygulamadaki üst düzey ekranlar.
 *
 * Router kullanılmadı: birkaç ekran var, derin bağlantı ihtiyacı yok ve Capacitor paketinde
 * tarayıcı adres çubuğu da yok. Basit bir durum değişkeni yeterli.
 */
export type AppView = 'menu' | 'migration' | 'gib' | 'versions' | 'dbs' | 'etrstatic' | 'autointeg' | 'versionpublish';

export const VIEW_TITLES: Record<AppView, string> = {
    menu: 'Dbt Admin Console',
    migration: 'Migration İşlemleri',
    gib: 'GİB API İşlemleri',
    versions: 'Servis Sürümleri',
    dbs: 'DBS Otomatik Gönderim',
    etrstatic: 'Etr Statik İşlemleri',
    autointeg: 'Otomatik Hazırlık Yönetimi',
    versionpublish: 'Versiyon Ekleme',
};
