export type SettledResult<T, R> = { item: T; ok: true; value: R } | { item: T; ok: false; error: unknown };

/**
 * Maps `items` through `fn` with at most `limit` concurrent in-flight calls.
 * Never rejects — each item's outcome is captured in `SettledResult`.
 */
export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
): Promise<SettledResult<T, R>[]> {
    const cap = Math.max(1, Math.floor(limit));
    const results: SettledResult<T, R>[] = new Array(items.length);
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (nextIndex < items.length) {
            const i = nextIndex++;
            const item = items[i];
            try {
                results[i] = { item, ok: true, value: await fn(item) };
            } catch (error) {
                results[i] = { item, ok: false, error };
            }
        }
    }

    const workers = Array.from({ length: Math.min(cap, items.length) }, worker);
    await Promise.all(workers);
    return results;
}
