/**
 * Login.Api sözleşmesi — sunucudaki TokenRequest/TokenResponse'un kullanılan alanları.
 * Alan adları kısaltmalı; sunucu sözleşmesi böyle.
 */

/**
 * ProgramTypeEnum.DbtAdmin_Web.
 *
 * Bilinçli seçim: TokenService.GetToken bu program tipinde bakım penceresi kontrolünü atlar,
 * yani konsol sistem bakımdayken de giriş yapabilir — bir yönetim aracı için doğru davranış.
 * Değiştirmeyin.
 */
export const PRG_TYPE_DBT_ADMIN_WEB = 20;

export const USER_ROLE = {
    customer: 0,
    agent: 5,
    devatek: 9,
} as const;

export interface LoginRequest {
    loginNameOrEmail: string;
    password: string;
    prgType: number;
}

export interface LoginResponse {
    /** Guid.Empty ("00000000-...") ise kimlik doğrulanmamış demektir. */
    id: string;
    em?: string | null;
    nm?: string | null;
    sn?: string | null;
    dn?: string | null;
    /** Rol — USER_ROLE. */
    rl: number;
    isPc?: boolean;
    /**
     * Login.Api erişim belirteci. Konsol yalnız kimliği doğrulamak için giriş yapar;
     * bu belirteç Service.Api çağrılarında KULLANILMAZ — o uçlar şu an anonim.
     * master uçlarına auth eklendiğinde çağrılara buradan eklenecek.
     */
    lat?: string | null;
    exp?: number;
    /** Etkin bakım başlığı; doluysa sunucu kimlik yerine bakım bilgisi döndürmüştür. */
    mit?: string | null;
}

export const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

export function isAuthenticatedResponse(user: LoginResponse | null): boolean {
    return user != null && !!user.id && user.id.toLowerCase() !== EMPTY_GUID;
}

export function fullName(user: LoginResponse): string {
    if (user.dn && user.dn.trim()) {
        return user.dn.trim();
    }

    const name = `${user.nm ?? ''} ${user.sn ?? ''}`.trim();

    return name || user.em || '';
}

export function roleName(role: number): string {
    switch (role) {
        case USER_ROLE.devatek:
            return 'Devatek';
        case USER_ROLE.agent:
            return 'Bayi';
        case USER_ROLE.customer:
            return 'Müşteri';
        default:
            return String(role);
    }
}
