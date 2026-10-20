/**
 * IBS (israeli-bank-scrapers) stamps scraped dates as midnight in IBS_DATE_TIMEZONE (see
 * `@badger/shared-data` source-timezones.ts) via a global moment.tz.setDefault. Handing that instant
 * straight to a `@db.Date` column keeps the previous UTC day (Israel midnight is 21:00/22:00Z the day
 * before), so bank-synced transactions landed one day early. These helpers read the calendar day in
 * the source zone instead.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function parseInstant(value: string): Date {
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) throw new Error(`Unparseable scraped date: ${JSON.stringify(value)}`);
    return instant;
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
    let formatter = formatters.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
        formatters.set(timeZone, formatter);
    }
    return formatter;
}

/** Calendar day of `value` as seen in `timeZone`, returned as UTC midnight of that day (what @db.Date columns store literally). Throws on an unparseable value. */
export function toSourceCalendarDate(value: string, timeZone: string): Date {
    const parts = getFormatter(timeZone).formatToParts(parseInstant(value));
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

/** What bank-sync stored before #9: Prisma writes @db.Date from the UTC components of new Date(value). Returned as UTC midnight of that UTC day. Used only to recognise rows the old logic shifted. Throws on an unparseable value. */
export function legacyStoredDate(value: string): Date {
    const instant = parseInstant(value);
    return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}
