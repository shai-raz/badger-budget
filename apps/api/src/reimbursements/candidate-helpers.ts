/**
 * Pure helpers for the candidates picker. No Nest or Prisma imports.
 */

/**
 * Reads a search string as an amount: strips whitespace, currency symbols and thousands commas, then requires a
 * plain non-negative number with at most 2 decimals. Returns null for anything else ("taizu", "12a", "1.234").
 */
export function parseSearchAmount(search: string): number | null {
    const cleaned = search.replace(/[\s₪$€£,]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    return Number(cleaned);
}

/**
 * Merges the date-before and date-after windows around `anchor` into one list ordered by distance from the anchor.
 * Ties go to the later date, then to the lower id. Returns at most `limit` rows.
 */
export function mergeNearest<T extends { id: string; transactionDate: Date }>(
    before: T[],
    after: T[],
    anchor: Date,
    limit: number,
): T[] {
    const anchorMs = anchor.getTime();
    return [...before, ...after]
        .sort((a, b) => {
            const distance =
                Math.abs(a.transactionDate.getTime() - anchorMs) - Math.abs(b.transactionDate.getTime() - anchorMs);
            if (distance !== 0) return distance;
            const later = b.transactionDate.getTime() - a.transactionDate.getTime();
            if (later !== 0) return later;
            return a.id.localeCompare(b.id);
        })
        .slice(0, limit);
}
