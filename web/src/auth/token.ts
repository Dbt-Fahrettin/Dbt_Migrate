/**
 * Giriş belirtecinin (JWT) kendi son kullanma zamanını okur.
 *
 * Neden gerekiyor: oturum süresi ile belirteç süresi aynı şey DEĞİL.
 * Login.Api belirteci **2 gün** geçerli üretiyor; konsolun oturumu ise Test/Local'de 30 gün.
 * Yani Test'te üçüncü gün kullanıcı hâlâ "giriş yapmış" görünür ama belirteci ölmüştür —
 * master uçları kimlik istemediği için Migration ekranı çalışmaya devam eder, GİB ekranı ise
 * 401 alır. Bunu sessiz bir hataya bırakmamak için kalan süre ekranda gösteriliyor.
 *
 * Oturumu belirtecin ömrüne kısaltmak bilinçli olarak yapılmadı: Migration işlemlerinin
 * belirtece ihtiyacı yok, o yüzden ana kullanım için iki günde bir giriş istemek gereksiz olurdu.
 */

/** JWT payload'ından `exp` (Unix saniye) okur; çözülemezse null. */
export function readTokenExpiry(token: string | null | undefined): Date | null {
    if (!token) {
        return null;
    }

    const parts = token.split('.');

    if (parts.length < 2) {
        return null;
    }

    let payload: unknown;

    try {
        // base64url → base64, sonra UTF-8 çözümü (Türkçe karakter taşıyabilir).
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));

        payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }

    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const exp = (payload as { exp?: unknown }).exp;

    if (typeof exp !== 'number' || !Number.isFinite(exp)) {
        return null;
    }

    return new Date(exp * 1000);
}

export function isTokenExpired(token: string | null | undefined, now: Date = new Date()): boolean {
    const expiry = readTokenExpiry(token);

    return expiry != null && expiry.getTime() <= now.getTime();
}

/** "2 gün 3 saat" / "4 saat 12 dk" / "süresi dolmuş" */
export function formatTokenRemaining(token: string | null | undefined, now: Date = new Date()): string {
    const expiry = readTokenExpiry(token);

    if (!expiry) {
        return 'bilinmiyor';
    }

    const ms = expiry.getTime() - now.getTime();

    if (ms <= 0) {
        return 'süresi dolmuş';
    }

    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) {
        return `${days} gün ${hours} saat`;
    }

    if (hours > 0) {
        return `${hours} saat ${minutes} dk`;
    }

    return `${minutes} dk`;
}
