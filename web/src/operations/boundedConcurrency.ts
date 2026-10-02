/**
 * Sınırlı sayıda eşzamanlı iş koşturur.
 *
 * N tane "işçi" aynı listeden sırayla iş çeker. Tüm bekleme HTTP üzerinde olduğu için tek iş
 * parçacıklı JavaScript'te de gerçek eşzamanlılık elde edilir; tarayıcı istekleri paralel yürütür.
 *
 * WPF sürümü `Parallel.ForEachAsync` kullanıyordu — o API iş parçacığı havuzuna dayanır ve
 * tarayıcıda karşılığı yoktur.
 */
export async function forEachBounded<T>(
    items: readonly T[],
    degreeOfParallelism: number,
    body: (item: T) => Promise<void>,
): Promise<void> {
    if (items.length === 0) {
        return;
    }

    let nextIndex = 0;

    const workerCount = Math.min(Math.max(degreeOfParallelism, 1), items.length);

    async function runWorker(): Promise<void> {
        for (;;) {
            const index = nextIndex;

            nextIndex += 1;

            if (index >= items.length) {
                return;
            }

            await body(items[index]);
        }
    }

    await Promise.all(Array.from({ length: workerCount }, runWorker));
}
