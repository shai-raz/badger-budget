export interface PeriodRange {
    start: Date;
    end: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes the previous equal-length period for a report window. All math is
 * in UTC — report dates arrive as `new Date("YYYY-MM-DD")` (UTC midnight),
 * matching how `transactionDate` stores date-only values.
 *
 * When the window is month-aligned (starts on the 1st, ends on a month's last
 * day) the previous period is the same number of *calendar* months ending the
 * day before `start` — so Jun 1–Jun 30 → May 1–May 31, Mar 1–May 31 →
 * Dec 1–Feb 28/29, and Jan 1–Dec 31 → the full prior year. Otherwise it falls
 * back to shifting the window back by its own length in days.
 */
export function getPreviousPeriod(start: Date, end: Date): PeriodRange {
    if (isFirstDayOfMonth(start) && isLastDayOfMonth(end)) {
        const monthSpan =
            (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;

        return {
            start: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - monthSpan, 1)),
            // Day 0 of start's month = last day of the previous month.
            end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0)),
        };
    }

    const lengthDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
    const previousEnd = new Date(start.getTime() - MS_PER_DAY);

    return {
        start: new Date(previousEnd.getTime() - (lengthDays - 1) * MS_PER_DAY),
        end: previousEnd,
    };
}

function isFirstDayOfMonth(date: Date): boolean {
    return date.getUTCDate() === 1;
}

function isLastDayOfMonth(date: Date): boolean {
    const nextDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    return nextDay.getUTCDate() === 1;
}
