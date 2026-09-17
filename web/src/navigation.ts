/**
 * Uygulamadaki üst düzey ekranlar.
 *
 * Router kullanılmadı: üç ekran var, derin bağlantı ihtiyacı yok ve Capacitor paketinde
 * tarayıcı adres çubuğu da yok. Basit bir durum değişkeni yeterli.
 */
export type AppView = 'menu' | 'migration' | 'gib';

export const VIEW_TITLES: Record<AppView, string> = {
    menu: 'Dbt Admin Console',
    migration: 'Migration İşlemleri',
    gib: 'GİB API İşlemleri',
};
