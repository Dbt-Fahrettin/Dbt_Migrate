import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * Sonuç listeleri: Tamamlananlar / Hatalılar.
 *
 * Liste sanallaştırılır — binlerce paketlik akışta tüm satırları DOM'a basmak tarayıcıyı kilitler.
 * (Blazor sürümü aynı sebeple listeyi 2000 satırda kesiyordu; sanallaştırmayla kesmeye gerek yok.)
 *
 * Kopyalama dokunmatik ekranı da düşünerek kuruldu: satıra tıklamak o satırı, üstteki düğme
 * listenin tamamını panoya alır (WPF'teki çoklu seçim + sağ tuş menüsü telefonda yok).
 */

type Tab = 'done' | 'errors';

interface Props {
    lines: string[];
    errors: string[];
    /** Listelerin üstündeki işlem satırı. */
    operation: string;
    /** Akış sürerken liste kendiliğinden en alta kayar. */
    isRunning: boolean;
}

const ROW_HEIGHT = 22;

export function LogPane({ lines, errors, operation, isRunning }: Props) {
    const [tab, setTab] = useState<Tab>('done');
    const [copied, setCopied] = useState('');

    const scrollRef = useRef<HTMLDivElement>(null);
    const followRef = useRef(true);

    const items = tab === 'done' ? lines : errors;

    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 20,
    });

    // Hata çıktığında kullanıcıyı hatalar sekmesine çekmek yerine yalnız rozette gösteriyoruz;
    // akış sürerken sekme değiştirmek, bakılan yeri kaybettiriyor.
    useEffect(() => {
        if (!isRunning || !followRef.current || items.length === 0) {
            return;
        }

        virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
    }, [items.length, isRunning, virtualizer]);

    function handleScroll() {
        const element = scrollRef.current;

        if (!element) {
            return;
        }

        // Kullanıcı yukarı kaydırdıysa otomatik takibi bırak; en alta dönerse tekrar başlat.
        followRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    }

    async function copyText(text: string, note: string) {
        try {
            await navigator.clipboard.writeText(text);

            setCopied(note);
            setTimeout(() => setCopied(''), 1500);
        } catch {
            setCopied('kopyalanamadı');
            setTimeout(() => setCopied(''), 1500);
        }
    }

    return (
        <section className="flex min-h-[55dvh] flex-1 flex-col rounded-2xl lg:min-h-0 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-2 dark:border-slate-800">
                <div className="flex gap-1">
                    <TabButton isActive={tab === 'done'} onClick={() => setTab('done')}>
                        Tamamlananlar <Badge>{lines.length}</Badge>
                    </TabButton>
                    <TabButton
                        isActive={tab === 'errors'}
                        onClick={() => setTab('errors')}
                        isAlert={errors.length > 0}
                    >
                        Hatalılar <Badge isAlert={errors.length > 0}>{errors.length}</Badge>
                    </TabButton>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    {copied && <span className="text-xs text-emerald-600 dark:text-emerald-400">{copied}</span>}
                    <button
                        type="button"
                        disabled={items.length === 0}
                        onClick={() => copyText(items.join('\n'), `${items.length} satır kopyalandı`)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        Tümünü kopyala
                    </button>
                </div>
            </div>

            {operation && (
                <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[11px] break-all text-sky-700 dark:border-slate-800 dark:bg-slate-950 dark:text-sky-300">
                    {operation}
                </p>
            )}

            <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-auto">
                {items.length === 0 ? (
                    <p className="p-4 text-sm text-slate-400 dark:text-slate-500">
                        {tab === 'done' ? 'Henüz işlem çalıştırılmadı.' : 'Hata yok.'}
                    </p>
                ) : (
                    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                        {virtualizer.getVirtualItems().map((row) => (
                            <button
                                key={row.key}
                                type="button"
                                onClick={() => copyText(items[row.index], 'satır kopyalandı')}
                                title="Tıkla, panoya kopyalansın"
                                className={[
                                    'absolute left-0 flex w-full items-center px-3 text-left font-mono text-xs whitespace-pre',
                                    'hover:bg-slate-100 dark:hover:bg-slate-800',
                                    tab === 'errors'
                                        ? 'text-red-700 dark:text-red-300'
                                        : 'text-slate-700 dark:text-slate-300',
                                ].join(' ')}
                                style={{ top: row.start, height: row.size }}
                            >
                                <span className="truncate">{items[row.index]}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

function TabButton({
    isActive,
    isAlert,
    onClick,
    children,
}: {
    isActive: boolean;
    isAlert?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                isActive
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : isAlert
                      ? 'text-red-600 hover:bg-slate-100 dark:text-red-400 dark:hover:bg-slate-800'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            ].join(' ')}
        >
            {children}
        </button>
    );
}

function Badge({ children, isAlert }: { children: React.ReactNode; isAlert?: boolean }) {
    return (
        <span
            className={[
                'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                isAlert
                    ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    : 'bg-slate-200 dark:bg-slate-700',
            ].join(' ')}
        >
            {children}
        </span>
    );
}
