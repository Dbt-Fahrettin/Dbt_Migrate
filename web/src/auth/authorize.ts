import { ALLOWED_EMAILS, MINIMUM_ROLE } from '../config/environments';
import type { LoginResponse } from './types';
import { roleName } from './types';

/**
 * Kimliği doğrulanan kullanıcının konsolu kullanmaya yetkili olup olmadığı.
 * Uygunsa null, değilse gösterilecek mesaj döner.
 *
 * Bu kontrol hem girişte hem de kayıtlı oturum geri yüklenirken uygulanır:
 * kural daraltıldığında eski oturumlar kendiliğinden geçersiz olsun diye.
 */
export function authorize(user: LoginResponse): string | null {
    const allowed = ALLOWED_EMAILS.filter((d) => d.trim());

    if (allowed.length > 0) {
        const isListed = allowed.some((d) => d.trim().toLowerCase() === (user.em ?? '').trim().toLowerCase());

        if (!isListed) {
            return 'Bu hesap konsolu kullanmaya yetkili değil.';
        }
    }

    if (user.rl < MINIMUM_ROLE) {
        return `Bu hesabın rolü (${roleName(user.rl)}) konsol için yeterli değil. Konsol yalnız Devatek personeline açıktır.`;
    }

    return null;
}
