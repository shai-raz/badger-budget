export interface LocalDateTimeParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
    let formatter = formatters.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-US", {
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
        formatters.set(timeZone, formatter);
    }
    return formatter;
}

/** Wall-clock components of `date` as seen in `timeZone`. */
export function getZonedDateParts(date: Date, timeZone: string): LocalDateTimeParts {
    const parts = getFormatter(timeZone).formatToParts(date);

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

/** The instant at which `localDateTime` wall-clock time occurs in `timeZone`. */
export function zonedDateTimeToUtcDate(localDateTime: LocalDateTimeParts, timeZone: string): Date {
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

/** Offset of `timeZone` from UTC at `date`, in milliseconds (positive east of UTC). */
export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
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
