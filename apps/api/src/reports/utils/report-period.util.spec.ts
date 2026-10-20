import { toIsoDateString } from "@badger/utils";
import { getPreviousPeriod } from "./report-period.util";

const utc = (value: string) => new Date(value);

describe("getPreviousPeriod", () => {
    it("returns the previous month for a single-month window", () => {
        const result = getPreviousPeriod(utc("2026-07-01"), utc("2026-07-31"));

        expect(toIsoDateString(result.start)).toBe("2026-06-01");
        expect(toIsoDateString(result.end)).toBe("2026-06-30");
    });

    it("returns the previous N months for a multi-month window", () => {
        const result = getPreviousPeriod(utc("2026-03-01"), utc("2026-05-31"));

        expect(toIsoDateString(result.start)).toBe("2025-12-01");
        expect(toIsoDateString(result.end)).toBe("2026-02-28");
    });

    it("returns the prior year for a full-year window", () => {
        const result = getPreviousPeriod(utc("2026-01-01"), utc("2026-12-31"));

        expect(toIsoDateString(result.start)).toBe("2025-01-01");
        expect(toIsoDateString(result.end)).toBe("2025-12-31");
    });

    it("crosses a year boundary for a January window", () => {
        const result = getPreviousPeriod(utc("2026-01-01"), utc("2026-01-31"));

        expect(toIsoDateString(result.start)).toBe("2025-12-01");
        expect(toIsoDateString(result.end)).toBe("2025-12-31");
    });

    it("handles a leap-year February window", () => {
        const result = getPreviousPeriod(utc("2028-03-01"), utc("2028-03-31"));

        expect(toIsoDateString(result.start)).toBe("2028-02-01");
        expect(toIsoDateString(result.end)).toBe("2028-02-29");
    });

    it("ends in a leap February when the previous window lands there", () => {
        const result = getPreviousPeriod(utc("2028-03-01"), utc("2028-05-31"));

        expect(toIsoDateString(result.start)).toBe("2027-12-01");
        expect(toIsoDateString(result.end)).toBe("2028-02-29");
    });

    it("falls back to a day-length shift for non-month-aligned windows", () => {
        // 10-day window → previous 10 days ending the day before start.
        const result = getPreviousPeriod(utc("2026-07-11"), utc("2026-07-20"));

        expect(toIsoDateString(result.start)).toBe("2026-07-01");
        expect(toIsoDateString(result.end)).toBe("2026-07-10");
    });

    it("handles a single-day window in the fallback path", () => {
        const result = getPreviousPeriod(utc("2026-07-15"), utc("2026-07-15"));

        expect(toIsoDateString(result.start)).toBe("2026-07-14");
        expect(toIsoDateString(result.end)).toBe("2026-07-14");
    });
});
