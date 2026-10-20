import type { BudgetAnalytics } from "@badger/types";
import { calendarDaysUntil } from "./relativeTime";

// Reuse BudgetAnalytics's own literal instead of redeclaring it.
export type BudgetPeriod = BudgetAnalytics["period"];

const PERIOD_LABEL: Record<BudgetPeriod, string> = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
};

export function budgetPeriodLabel(p: BudgetPeriod): string {
    return PERIOD_LABEL[p];
}

const toDate = (date: Date | string): Date => (typeof date === "string" ? new Date(date) : date);

export type BudgetLevel = "ok" | "warning" | "over";

export function budgetProgressLevel(pct: number): BudgetLevel {
    if (pct >= 100) return "over";
    if (pct >= 75) return "warning";
    return "ok";
}

// Progress bar fill per level. Read by BudgetsBudgetProgressBar only.
export const BUDGET_LEVEL_COLOR: Record<BudgetLevel, string> = {
    ok: "#10b981",
    warning: "#f59e0b",
    over: "#ef4444",
};

// Text colour for a level's "Spent"/"Used" figures. "ok" stays the inherited colour.
export const BUDGET_LEVEL_TEXT_CLASS: Record<BudgetLevel, string> = {
    ok: "",
    warning: "text-amber-500",
    over: "text-rose-500",
};

/** "Ends today" for 0, "1 day left" for 1, "N days left" otherwise. */
export function formatDaysLeft(n: number): string {
    if (n === 0) return "Ends today";
    if (n === 1) return "1 day left";
    return `${n} days left`;
}

/**
 * "Ends today"/"N days left" copy for a budget's `periodEnd`, using calendar-day
 * (not elapsed-ms) semantics: `periodEnd` is the inclusive end of the last day at
 * 23:59:59.999 local, so an elapsed-ms ceiling would say "1 day left" at any hour
 * of that last day instead of "Ends today".
 */
export function budgetDaysLeftLabel(periodEnd: Date | string, now: Date = new Date()): string {
    return formatDaysLeft(Math.max(calendarDaysUntil(periodEnd, now), 0));
}

const MINUTE_MS = 60 * 1000;

/**
 * Minutes to add to a UTC instant to get local wall time in the zone the API used:
 * window starts are local midnight there. The API computes windows in the user's zone
 * (currently UTC, apps/api/src/budgets/utils/budget-period.util.ts DEFAULT_TIME_ZONE), so
 * the browser zone is never used. UTC+13/+14 starts are read as −11/−10; this is a known limitation.
 */
export function inferWindowOffsetMinutes(periodStart: Date | string): number {
    const start = toDate(periodStart);
    const m = start.getUTCHours() * 60 + start.getUTCMinutes();
    if (m === 0) return 0;
    if (m >= 720) return 1440 - m;
    return -m;
}

const shiftBy = (date: Date | string, offsetMinutes: number): Date =>
    new Date(toDate(date).getTime() + offsetMinutes * MINUTE_MS);

const utcFormat = (options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options });

const MONTH_SHORT = utcFormat({ month: "short" });
const MONTH_LONG = utcFormat({ month: "long" });
const MONTH_DAY_SHORT = utcFormat({ month: "short", day: "numeric" });
const MONTH_DAY_LONG = utcFormat({ month: "long", day: "numeric" });
const MONTH_DAY_YEAR_SHORT = utcFormat({ month: "short", day: "numeric", year: "numeric" });
const MONTH_DAY_YEAR_LONG = utcFormat({ month: "long", day: "numeric", year: "numeric" });

const PERIOD_NOUN: Record<BudgetPeriod, "day" | "week" | "month" | "year"> = {
    daily: "day",
    weekly: "week",
    monthly: "month",
    yearly: "year",
};

export function budgetPeriodNoun(period: BudgetPeriod): "day" | "week" | "month" | "year" {
    return PERIOD_NOUN[period];
}

const CURRENT_PERIOD_LABEL: Record<BudgetPeriod, string> = {
    daily: "Today",
    weekly: "This week",
    monthly: "This month",
    yearly: "This year",
};

/** "Today" / "This week" / "This month" / "This year". */
export function budgetCurrentPeriodLabel(period: BudgetPeriod): string {
    return CURRENT_PERIOD_LABEL[period];
}

/**
 * Human label for a budget window, read in the API's zone (see `inferWindowOffsetMinutes`).
 * Compact: "Oct 14", "Oct 11–17", "Sep 28 – Oct 4", "Oct 2026", "2026". Daily and weekly add
 * ", YYYY" when the window's year differs from `now`'s year; a window that crosses years always
 * shows both years. Long: "October 14, 2026", "October 11 – 17, 2026", "October 2026", "2026".
 */
export function budgetWindowLabel(
    period: BudgetPeriod,
    periodStart: Date | string,
    periodEnd: Date | string,
    opts: { now?: Date; style?: "compact" | "long" } = {},
): string {
    const offset = inferWindowOffsetMinutes(periodStart);
    // periodEnd is the window's last millisecond; the next local midnight (end + 1ms) gives its own
    // offset, which differs from the start's when the zone changes DST inside the window.
    const endOffset = inferWindowOffsetMinutes(new Date(toDate(periodEnd).getTime() + 1));
    const start = shiftBy(periodStart, offset);
    const end = shiftBy(periodEnd, endOffset);
    const year = start.getUTCFullYear();
    const long = opts.style === "long";
    const showYear = long || year !== shiftBy(opts.now ?? new Date(), offset).getUTCFullYear();

    if (period === "yearly") return `${year}`;
    if (period === "monthly") return `${(long ? MONTH_LONG : MONTH_SHORT).format(start)} ${year}`;

    if (period === "daily") {
        const day = (long ? MONTH_DAY_LONG : MONTH_DAY_SHORT).format(start);
        return showYear ? `${day}, ${year}` : day;
    }

    // weekly
    if (end.getUTCFullYear() !== year) {
        const fmt = long ? MONTH_DAY_YEAR_LONG : MONTH_DAY_YEAR_SHORT;
        return `${fmt.format(start)} – ${fmt.format(end)}`;
    }
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    let range: string;
    if (sameMonth) {
        const month = (long ? MONTH_LONG : MONTH_SHORT).format(start);
        range = long
            ? `${month} ${start.getUTCDate()} – ${end.getUTCDate()}`
            : `${month} ${start.getUTCDate()}–${end.getUTCDate()}`;
    } else {
        const fmt = long ? MONTH_DAY_LONG : MONTH_DAY_SHORT;
        range = `${fmt.format(start)} – ${fmt.format(end)}`;
    }
    return showYear ? `${range}, ${year}` : range;
}
