// Pure, dependency-free time-formatting helpers. `now` is always the last
// param (defaulting to `new Date()`) so callers can pass a fixed instant in
// tests instead of relying on the system clock.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const toDate = (date: Date | string): Date => (typeof date === "string" ? new Date(date) : date);

/**
 * "Synced " + formatTimeAgo(...) style long-form label.
 * <1 min "just now"; <60 min "N min ago"; <24h "1 hour ago"/"N hours ago"; else "1 day ago"/"N days ago".
 */
export function formatTimeAgo(date: Date | string, now: Date = new Date()): string {
    const diffMs = now.getTime() - toDate(date).getTime();

    if (diffMs < MINUTE_MS) return "just now";

    const minutes = Math.floor(diffMs / MINUTE_MS);
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(diffMs / HOUR_MS);
    if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;

    const days = Math.floor(diffMs / DAY_MS);
    return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Compact variant: "now" / "Nm ago" / "Nh ago" / "Nd ago". */
export function formatTimeAgoCompact(date: Date | string, now: Date = new Date()): string {
    const diffMs = now.getTime() - toDate(date).getTime();

    if (diffMs < MINUTE_MS) return "now";

    const minutes = Math.floor(diffMs / MINUTE_MS);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(diffMs / HOUR_MS);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(diffMs / DAY_MS);
    return `${days}d ago`;
}

/** True once `now - date` exceeds `thresholdDays` (exactly the threshold is NOT stale). */
export function isStale(date: Date | string, now: Date = new Date(), thresholdDays = 3): boolean {
    const diffMs = now.getTime() - toDate(date).getTime();
    return diffMs > thresholdDays * DAY_MS;
}

/**
 * Whole local calendar days from today to `date` (0 = today, negative = past).
 * Computed from local Y/M/D via Date.UTC so DST transitions don't skew the count.
 */
export function calendarDaysUntil(date: Date | string, now: Date = new Date()): number {
    const target = toDate(date);
    const startOfTarget = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
    const startOfNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((startOfTarget - startOfNow) / DAY_MS);
}
