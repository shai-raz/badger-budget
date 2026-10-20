/** Formats a UTC-midnight date as YYYY-MM-DD. */
export function toIsoDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
}
