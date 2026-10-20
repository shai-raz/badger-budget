export type BudgetPeriod = "daily" | "weekly" | "monthly" | "yearly";

export interface BudgetPeriodContext {
    period: BudgetPeriod;
    referenceDate?: Date;
    /**
     * Number of whole periods to shift the window relative to `referenceDate`.
     * `0` = the period containing `referenceDate` (default), negative = past
     * periods (e.g. `-1` = the immediately preceding period). This is the cursor
     * the budgets UI moves with its `‹ ›` navigation.
     */
    periodOffset?: number;
    /**
     * The budget's own start-date anchor. Reserved as the single extension seam
     * for the planned "custom recurring anchor" feature (e.g. a monthly budget
     * that resets on the 15th). Today, period boundaries are calendar-aligned
     * regardless of this value, so passing it is a no-op and current behavior is
     * unchanged. When custom anchors ship, only this function changes to derive
     * boundaries from the anchor's day-of-month / weekday — the controller,
     * service, and UI navigation stay exactly as they are.
     */
    anchorDate?: Date;
    timeZone?: string;
    locale?: string;
}

export interface BudgetPeriodWindow {
    periodStart: Date;
    periodEnd: Date;
}

const DEFAULT_TIME_ZONE = "UTC";
const DEFAULT_LOCALE = "en-US";

/**
 * Computes the `{ periodStart, periodEnd }` window (in UTC) for a budget's
 * period type, shifted by `periodOffset` whole periods from `referenceDate`.
 *
 * The offset is applied to the zoned reference date *before* the calendar
 * boundary math runs, so at `periodOffset: 0` the result is identical to the
 * current period and negative offsets yield the correct past windows.
 */
export function getBudgetPeriodWindow({
    period,
    referenceDate = new Date(),
    periodOffset = 0,
    timeZone = DEFAULT_TIME_ZONE,
    locale = DEFAULT_LOCALE,
}: BudgetPeriodContext): BudgetPeriodWindow {
    const zoned = getZonedDateParts(referenceDate, timeZone);
    const ref = shiftReferenceByPeriods(zoned, period, periodOffset);

    let start: LocalDateTimeParts;
    let end: LocalDateTimeParts;

    switch (period) {
        case "daily":
            start = {
                year: ref.year,
                month: ref.month,
                day: ref.day,
                hour: 0,
                minute: 0,
                second: 0,
                millisecond: 0,
            };
            end = {
                year: ref.year,
                month: ref.month,
                day: ref.day,
                hour: 23,
                minute: 59,
                second: 59,
                millisecond: 999,
            };
            break;

        case "weekly": {
            const weekStartDay = resolveWeekStartDay(locale);
            const currentWeekday = getWeekdayIndex(ref.year, ref.month, ref.day);
            const dayOffset = (currentWeekday - weekStartDay + 7) % 7;
            const weekStartDate = new Date(Date.UTC(ref.year, ref.month - 1, ref.day - dayOffset));

            start = {
                year: weekStartDate.getUTCFullYear(),
                month: weekStartDate.getUTCMonth() + 1,
                day: weekStartDate.getUTCDate(),
                hour: 0,
                minute: 0,
                second: 0,
                millisecond: 0,
            };

            const weekEndDate = new Date(
                Date.UTC(weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth(), weekStartDate.getUTCDate() + 6),
            );

            end = {
                year: weekEndDate.getUTCFullYear(),
                month: weekEndDate.getUTCMonth() + 1,
                day: weekEndDate.getUTCDate(),
                hour: 23,
                minute: 59,
                second: 59,
                millisecond: 999,
            };
            break;
        }

        case "monthly": {
            const lastDay = new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();

            start = {
                year: ref.year,
                month: ref.month,
                day: 1,
                hour: 0,
                minute: 0,
                second: 0,
                millisecond: 0,
            };

            end = {
                year: ref.year,
                month: ref.month,
                day: lastDay,
                hour: 23,
                minute: 59,
                second: 59,
                millisecond: 999,
            };
            break;
        }

        case "yearly":
            start = {
                year: ref.year,
                month: 1,
                day: 1,
                hour: 0,
                minute: 0,
                second: 0,
                millisecond: 0,
            };
            end = {
                year: ref.year,
                month: 12,
                day: 31,
                hour: 23,
                minute: 59,
                second: 59,
                millisecond: 999,
            };
            break;

        default:
            throw new Error(`Invalid period: ${period}`);
    }

    return {
        periodStart: zonedDateTimeToUtcDate(start, timeZone),
        periodEnd: zonedDateTimeToUtcDate(end, timeZone),
    };
}

/**
 * Backwards-compatible wrapper: the current period (no offset). Existing
 * callers and tests can keep using this name unchanged.
 */
export function getCurrentBudgetPeriodWindow(context: BudgetPeriodContext): BudgetPeriodWindow {
    return getBudgetPeriodWindow({ ...context, periodOffset: 0 });
}

interface ZonedYearMonthDay {
    year: number;
    month: number;
    day: number;
}

/**
 * Shifts the reference year/month/day by `periodOffset` whole periods. The math
 * is done with `Date.UTC` so month/year rollover and month-length differences
 * are handled correctly. For `monthly`/`yearly` only the resulting year/month
 * matter (day is normalized by the boundary switch); shifting monthly on day 1
 * avoids short-month overflow (e.g. Mar 31 − 1 month must land in February).
 */
function shiftReferenceByPeriods(
    zoned: LocalDateTimeParts,
    period: BudgetPeriod,
    periodOffset: number,
): ZonedYearMonthDay {
    if (periodOffset === 0) {
        return { year: zoned.year, month: zoned.month, day: zoned.day };
    }

    switch (period) {
        case "daily":
            return fromUtc(new Date(Date.UTC(zoned.year, zoned.month - 1, zoned.day + periodOffset)));

        case "weekly":
            return fromUtc(new Date(Date.UTC(zoned.year, zoned.month - 1, zoned.day + periodOffset * 7)));

        case "monthly":
            return fromUtc(new Date(Date.UTC(zoned.year, zoned.month - 1 + periodOffset, 1)));

        case "yearly":
            return { year: zoned.year + periodOffset, month: zoned.month, day: 1 };

        default:
            throw new Error(`Invalid period: ${period}`);
    }
}

function fromUtc(date: Date): ZonedYearMonthDay {
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
    };
}

interface LocalDateTimeParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
}

function getZonedDateParts(date: Date, timeZone: string): LocalDateTimeParts {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        hourCycle: "h23",
    });

    const parts = formatter.formatToParts(date);

    const hour = Number(getPart(parts, "hour"));

    return {
        year: Number(getPart(parts, "year")),
        month: Number(getPart(parts, "month")),
        day: Number(getPart(parts, "day")),
        hour: hour === 24 ? 0 : hour,
        minute: Number(getPart(parts, "minute")),
        second: Number(getPart(parts, "second")),
        millisecond: date.getUTCMilliseconds(),
    };
}

function getPart(parts: Intl.DateTimeFormatPart[], type: string) {
    return parts.find((part) => part.type === type)?.value ?? "0";
}

function getWeekdayIndex(year: number, month: number, day: number): number {
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function resolveWeekStartDay(locale: string): number {
    try {
        const intlLocale = new Intl.Locale(locale) as Intl.Locale & {
            weekInfo?: { firstDay?: number };
        };
        const firstDay = intlLocale.weekInfo?.firstDay;

        if (typeof firstDay === "number") {
            // Intl.Locale weekInfo: Monday=1 .. Sunday=7
            return firstDay % 7;
        }
    } catch {
        // no-op fallback
    }

    const normalized = locale.toLowerCase();

    if (normalized.startsWith("en-us") || normalized.startsWith("en-ca")) {
        return 0;
    }

    return 1;
}

function zonedDateTimeToUtcDate(localDateTime: LocalDateTimeParts, timeZone: string): Date {
    const utcGuess = Date.UTC(
        localDateTime.year,
        localDateTime.month - 1,
        localDateTime.day,
        localDateTime.hour,
        localDateTime.minute,
        localDateTime.second,
        localDateTime.millisecond,
    );

    const offsetAtGuess = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
    let utcTimestamp = utcGuess - offsetAtGuess;

    const offsetAtTarget = getTimeZoneOffsetMs(new Date(utcTimestamp), timeZone);
    if (offsetAtTarget !== offsetAtGuess) {
        utcTimestamp = utcGuess - offsetAtTarget;
    }

    return new Date(utcTimestamp);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
    const zoned = getZonedDateParts(date, timeZone);
    const zonedAsUtc = Date.UTC(
        zoned.year,
        zoned.month - 1,
        zoned.day,
        zoned.hour,
        zoned.minute,
        zoned.second,
        zoned.millisecond,
    );

    return zonedAsUtc - date.getTime();
}
