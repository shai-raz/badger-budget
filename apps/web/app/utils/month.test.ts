import { describe, expect, it } from "vitest";
import { currentMonthRange } from "./month";

describe("currentMonthRange", () => {
    it("spans the full month for a 31-day month", () => {
        expect(currentMonthRange(new Date("2026-12-15T12:00:00"))).toEqual({
            startDate: "2026-12-01",
            endDate: "2026-12-31",
        });
    });

    it("handles February in a leap year", () => {
        expect(currentMonthRange(new Date("2028-02-10T12:00:00"))).toEqual({
            startDate: "2028-02-01",
            endDate: "2028-02-29",
        });
    });

    it("handles February in a non-leap year", () => {
        expect(currentMonthRange(new Date("2026-02-10T12:00:00"))).toEqual({
            startDate: "2026-02-01",
            endDate: "2026-02-28",
        });
    });

    it("uses local date fields, not UTC", () => {
        // Late evening local time on the last day of May is already the next
        // calendar day in UTC (TZ is pinned to America/New_York in vitest.config.ts),
        // so a naive toISOString()-based implementation would roll this into June.
        expect(currentMonthRange(new Date("2026-05-31T23:30:00"))).toEqual({
            startDate: "2026-05-01",
            endDate: "2026-05-31",
        });
    });
});
