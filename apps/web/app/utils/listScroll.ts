/**
 * One-slot memory of a list's scroll position, used to restore the transactions
 * list when the user returns from a detail page. Module state is per-tab and
 * lives only for the session; a single slot is enough because only one list is
 * ever left for a detail page at a time.
 */

let saved: { key: string; top: number } | null = null;

/** Stable key for a list's query params, so a restore only applies to the same list. */
export function listScrollKey(params: unknown): string {
    return JSON.stringify(params);
}

export function saveListScroll(key: string, top: number): void {
    saved = { key, top };
}

/**
 * Returns the saved scroll top when `key` matches, and clears the slot either
 * way so a stale position never restores into a later, different visit.
 */
export function takeListScroll(key: string): number | null {
    const current = saved;
    saved = null;
    return current && current.key === key ? current.top : null;
}
