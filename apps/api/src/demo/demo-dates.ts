import { DEMO_WINDOW_MONTHS } from "./demo-data.constants";

/**
 * Converts a `Date` to UTC midnight of its *local* (server) calendar day. `transactionDate` is
 * `@db.Date`, so all demo dates are stored as UTC-midnight `Date` objects — reading the local
 * components here (not the UTC ones) keeps "today" meaning the server's actual calendar day
 * regardless of its timezone offset. Same pattern as bank-sync/scraped-balance.util.ts.
 */
export function toDateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Adds `n` days to a UTC-midnight date, returning a new UTC-midnight date. */
export function addDaysUtc(d: Date, n: number): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

/** First day (UTC midnight) of the UTC month containing `d`. */
export function startOfMonthUtc(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Last day (UTC midnight) of the UTC month containing `d`. */
export function endOfMonthUtc(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/** First day of the month `DEMO_WINDOW_MONTHS - 1` months before `today`'s month. */
export function demoWindowStart(today: Date): Date {
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (DEMO_WINDOW_MONTHS - 1), 1));
}

/**
 * A deterministic (but non-constant) salary day in 1..5 for a given month, derived from an
 * absolute month index so it's stable across runs without needing faker. Keeping it deterministic
 * per month — rather than random — means disjoint top-up windows (e.g. two separate generator
 * calls covering adjacent date ranges) can never produce zero or two salaries for the same month.
 */
export function demoSalaryDay(year: number, monthIndex: number): number {
    return ((year * 12 + monthIndex) % 5) + 1;
}

/**
 * A deterministic ATM-withdrawal day in 6..25 for a given month, never the salary days (1-5) or the
 * card-payoff day (15). Derived from the absolute month index, like `demoSalaryDay`, so disjoint
 * top-up windows never double- or zero-withdraw a month.
 */
export function demoAtmDay(year: number, monthIndex: number): number {
    const day = ((year * 12 + monthIndex) % 19) + 6; // 6..24
    return day === 15 ? 25 : day;
}

/**
 * The next occurrence (UTC midnight, `@db.Date`) of `day` of the month at or after `today` —
 * this month's if it hasn't passed yet, otherwise next month's. Used for a demo card's
 * `next_charge` `balanceDate`, which must never read as overdue.
 */
export function nextUpcomingDebitDate(now: Date, day: number): Date {
    // Normalize a full timestamp to its calendar day so the debit day itself still counts as upcoming.
    const today = toDateOnly(now);
    const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
    if (candidate.getTime() >= today.getTime()) return candidate;
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, day));
}
