export interface PeriodRange {
    start: Date;
    end: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes the comparison period preceding a report window. All math is in
 * UTC — report dates arrive as `new Date("YYYY-MM-DD")` (UTC midnight),
 * matching how `transactionDate` stores date-only values.
 *
 * - Full months (starts on the 1st, ends on a month's last day): the same
 *   number of calendar months ending the day before `start` — so Jun 1–Jun 30 →
 *   May 1–May 31, Mar 1–May 31 → Dec 1–Feb 28/29, Jan 1–Dec 31 → the prior year.
 * - Starts on the 1st, ends mid-month: the same number of calendar months
 *   earlier, ending on the same day of the month (clamped to its length) — so
 *   Oct 1–26 → Sep 1–26, Aug 1–Oct 26 → May 1–Jul 26, Mar 1–30 → Feb 1–28.
 * - Otherwise: the window shifted back by its own length in days.
 */
export function getPreviousPeriod(start: Date, end: Date): PeriodRange {
    if (isFirstDayOfMonth(start)) {
        const monthSpan =
            (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;

        if (isLastDayOfMonth(end)) {
            return {
                start: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - monthSpan, 1)),
                // Day 0 of start's month = last day of the previous month.
                end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0)),
            };
        }

        return {
            start: shiftMonths(start, -monthSpan),
            end: shiftMonths(end, -monthSpan),
        };
    }

    const lengthDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
    const previousEnd = new Date(start.getTime() - MS_PER_DAY);

    return {
        start: new Date(previousEnd.getTime() - (lengthDays - 1) * MS_PER_DAY),
        end: previousEnd,
    };
}

/**
 * The same dates one year earlier, with the day clamped to the target month's
 * length — so Jan 1–Oct 26 2026 → Jan 1–Oct 26 2025, and Feb 29 2028 → Feb 28 2027.
 */
export function getYearOverYearPeriod(start: Date, end: Date): PeriodRange {
    return {
        start: shiftMonths(start, -12),
        end: shiftMonths(end, -12),
    };
}

/** Shifts a date by whole months in UTC, clamping the day to the target month's length. */
function shiftMonths(date: Date, months: number): Date {
    const targetYear = date.getUTCFullYear();
    const targetMonth = date.getUTCMonth() + months;
    const lastDay = daysInMonth(targetYear, targetMonth);

    return new Date(Date.UTC(targetYear, targetMonth, Math.min(date.getUTCDate(), lastDay)));
}

/** Day count of a month; `month` may be out of range and is normalized by Date.UTC. */
function daysInMonth(year: number, month: number): number {
    // Day 0 of the following month = last day of `month`.
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function isFirstDayOfMonth(date: Date): boolean {
    return date.getUTCDate() === 1;
}

function isLastDayOfMonth(date: Date): boolean {
    const nextDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    return nextDay.getUTCDate() === 1;
}
