// Build YYYY-MM-DD strings directly — never toISOString() on a local date.
import { lastDayOfMonth } from "./monthRange";

const pad = (n: number) => String(n).padStart(2, "0");

/** The current local month as `{ startDate, endDate }` (`YYYY-MM-01` / `YYYY-MM-<lastDay>`). */
export function currentMonthRange(now: Date = new Date()): { startDate: string; endDate: string } {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const endDay = lastDayOfMonth(year, month);

    return {
        startDate: `${year}-${pad(month)}-01`,
        endDate: `${year}-${pad(month)}-${pad(endDay)}`,
    };
}
