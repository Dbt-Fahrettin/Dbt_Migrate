import { useState } from 'react';
import { formatLastLogin, getPackUsageRanking, usageRangeOf } from '../../api/packUsage';
import type { PackUsageRanking } from '../../api/packUsage';
import { secondaryButtonClass } from './formControls';

interface Props {
    apiBaseUrl: string;
    startText: string;
    endText: string;
    disabled: boolean;
}

/**
 * Kullanım önceliğinin önizlemesi: işi başlatmadan hangi paketlerin önce işleneceğini gösterir.
 * Yalnız okur; sıralamayı işin kendisi sunucuda aynı kuralla kurar.
 */
export function UsagePreview({ apiBaseUrl, startText, endText, disabled }: Props) {
    const [ranking, setRanking] = useState<PackUsageRanking | null>(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    async function load() {
        setIsLoading(true);
        setError('');

        const range = usageRangeOf(startText, endText);
        const result = await getPackUsageRanking(apiBaseUrl, range.from, range.to, 25);

        setIsLoading(false);

        if (!result.isSuccess || !result.data) {
            setRanking(null);
            setError(
                result.status === 404
                    ? 'Sunucu bu özelliği henüz bilmiyor (yeni sürüm yayınlanmamış); iş numara sırasıyla çalışır.'
                    : result.error || `Okunamadı (durum ${result.status}).`,
            );

            return;
        }

        setRanking(result.data);
    }

    return (
        <div className="space-y-2">
            <button type="button" onClick={() => void load()} disabled={disabled || isLoading} className={secondaryButtonClass}>
                {isLoading ? 'Okunuyor...' : 'Öncelik sırasını göster'}
            </button>

            {error && <p className="text-xs text-red-700 dark:text-red-300">{error}</p>}

            {ranking && !ranking.isAvailable && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                    Kullanım verisi okunamadı ({ranking.message ?? 'neden yok'}): iş numara sırasıyla çalışır.
                </p>
            )}

            {ranking?.isAvailable && (
                <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Puan = sabah girişi ({ranking.earlyFromHour}:00-{ranking.earlyToHour - 1}:59) × {ranking.earlyWeight} + aktif
                        gün, son {ranking.windowDays} gün. Girişi olan {ranking.rankedCount} paket; kalanlar numara
                        sırasıyla sona kalır.
                    </p>
                    <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left font-mono text-[11px]">
                            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                                <tr>
                                    <th className="px-2 py-1">Paket</th>
                                    <th className="px-2 py-1">Puan</th>
                                    <th className="px-2 py-1">Sabah</th>
                                    <th className="px-2 py-1">Gün</th>
                                    <th className="px-2 py-1">Son giriş</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ranking.rows.map((row) => (
                                    <tr key={row.packNo} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="px-2 py-1">{row.packNo}</td>
                                        <td className="px-2 py-1">{row.score}</td>
                                        <td className="px-2 py-1">{row.earlyLogins}</td>
                                        <td className="px-2 py-1">{row.activeDays}</td>
                                        <td className="px-2 py-1">{formatLastLogin(row.lastLogin)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
