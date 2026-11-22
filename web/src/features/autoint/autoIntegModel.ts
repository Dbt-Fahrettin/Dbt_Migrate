/**
 * Otomatik Hazırlık ekranının saf kuralları (ekran ve testler ortak kullanır). Anahtar çözümlemesinin kendisi
 * sunucudadır (Service.Api `AutoIntegSwitchState`); burada yalnız ekranın söylediği metinler, süzgeç ve paket metni ayrıştırma var.
 */

export interface PackLike {
    packNo: number;
    name?: string | null;
    allowed: boolean;
    explicit?: string | null;
    enabledCompanies?: number | null;
}

export interface StatusLike {
    master?: boolean | null;
    settingsEnabled: boolean;
}

export type PackFilter = 'all' | 'open' | 'closed' | 'explicit' | 'withCompanies';

export const PACK_FILTER_LABELS: Record<PackFilter, string> = {
    all: 'Tümü',
    open: 'Açık paketler',
    closed: 'Kapalı paketler',
    explicit: 'Pakete özel işaretli',
    withCompanies: 'Ayarı açık firması olan',
};

/** Tek seferde gönderilebilecek en çok paket (sunucu sınırıyla aynı). */
export const MAX_PACKS_PER_CALL = 500;

export type MasterTone = 'on' | 'off' | 'file';

/** Ana şalterin ekranda yazan durumu. */
export function masterText(s: StatusLike): { label: string; detail: string; tone: MasterTone } {
    if (s.master === true) {
        return { label: 'Açık', detail: 'Bu ekrandan açıldı (yapılandırma dosyası beklenmez).', tone: 'on' };
    }

    if (s.master === false) {
        return { label: 'Kapalı', detail: 'Bu ekrandan kapatıldı; hiçbir paket çalışmaz.', tone: 'off' };
    }

    return {
        label: s.settingsEnabled ? 'Açık (yapılandırma dosyası)' : 'Kapalı (yapılandırma dosyası)',
        detail: 'Ekran anahtarı kurulmamış; durum servisin yapılandırma dosyasından geliyor.',
        tone: 'file',
    };
}

/** "Tüm paketler" bayrağının ekranda yazan durumu. */
export function allPacksText(allPacks: boolean | null | undefined): string {
    if (allPacks === true) {
        return 'Tüm canlı paketlere açık';
    }

    if (allPacks === false) {
        return 'Yalnız açık listedeki paketler';
    }

    return 'Yapılandırma dosyasındaki paket listesi geçerli';
}

/** Paketin durum hücresi: açık / kapalı ve nedeni. */
export function packStateText(p: Pick<PackLike, 'allowed' | 'explicit'>): string {
    if (p.explicit === 'on') {
        return 'Açık (pakete özel)';
    }

    if (p.explicit === 'off') {
        return 'Kapalı (pakete özel)';
    }

    return p.allowed ? 'Açık (genel kural)' : 'Kapalı (genel kural)';
}

function fold(text: string): string {
    return text.toLocaleLowerCase('tr-TR');
}

/** Arama (paket no ya da ad parçası) ve süzgeç; sıralama ekranın işi. */
export function filterPacks<T extends PackLike>(packs: T[], query: string, filter: PackFilter): T[] {
    const q = fold(query.trim());

    return packs.filter((p) => {
        if (q && !String(p.packNo).includes(q) && !fold(p.name ?? '').includes(q)) {
            return false;
        }

        switch (filter) {
            case 'open':
                return p.allowed;
            case 'closed':
                return !p.allowed;
            case 'explicit':
                return !!p.explicit;
            case 'withCompanies':
                return (p.enabledCompanies ?? 0) > 0;
            default:
                return true;
        }
    });
}

/**
 * Yapıştırılan metni paket numaralarına çevirir. Geçersiz parça (rakam olmayan, sıfır, çok büyük) hata sayılır:
 * sessizce atlamak, yapıştırılan listenin bir kısmının uygulanmadığını gizlerdi.
 */
export function parsePackNos(text: string): { packs: string[]; invalid: string[] } {
    const packs: string[] = [];
    const invalid: string[] = [];

    for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
        const n = /^\d{1,7}$/.test(part) ? Number(part) : 0;

        if (n > 0) {
            if (!packs.includes(String(n))) {
                packs.push(String(n));
            }
        } else {
            invalid.push(part.length > 20 ? `${part.slice(0, 20)}…` : part);
        }
    }

    return { packs, invalid };
}

export type BulkAction = 'master-on' | 'master-off' | 'master-file' | 'all-on' | 'all-off' | 'reset';

/** Onay penceresinin metni: işlem, etkisi ve hangi ortamı yönettiği. */
export function confirmText(action: BulkAction, env: string): { title: string; body: string; button: string } {
    switch (action) {
        case 'master-on':
            return {
                title: `${env}: otomatik hazırlık açılsın mı?`,
                body: 'Ana şalter açılır; paket kuralına uyan paketlerin firmaları gece GİB faturalarından hazırlanır.',
                button: 'Aç',
            };
        case 'master-off':
            return {
                title: `${env}: otomatik hazırlık kapatılsın mı?`,
                body: 'Ana şalter kapanır; hiçbir pakette hazırlık çalışmaz ve istemci ekranları gizlenir.',
                button: 'Kapat',
            };
        case 'master-file':
            return {
                title: `${env}: yapılandırma dosyasına dönülsün mü?`,
                body: 'Ekran anahtarı kaldırılır; durum servisin yapılandırma dosyasından belirlenir.',
                button: 'Dosyaya dön',
            };
        case 'all-on':
            return {
                title: `${env}: tüm paketlere açılsın mı?`,
                body: 'Tüm canlı paketler açılır ve pakete özel kapatmalar silinir. Ayarını açmış her firmanın GİB önbelleği okunup hazırlık kaydı yazılır.',
                button: 'Tüm paketlere aç',
            };
        case 'all-off':
            return {
                title: `${env}: tümü kapatılsın mı?`,
                body: 'Tüm paketler kapanır ve pakete özel açmalar silinir; yalnızca sonradan tek tek açtıklarınız çalışır.',
                button: 'Tümünü kapat',
            };
        case 'reset':
            return {
                title: `${env}: ekran anahtarları silinsin mi?`,
                body: 'Ana şalter, tüm paketler bayrağı ve paket işaretleri silinir; davranış yalnız yapılandırma dosyasına bağlı olur.',
                button: 'Sıfırla',
            };
    }
}
