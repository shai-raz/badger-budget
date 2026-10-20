import { getBudgetPeriodWindow, getCurrentBudgetPeriodWindow } from "./budget-period.util";

describe("getCurrentBudgetPeriodWindow", () => {
    it("should compute deterministic day boundaries in the provided timezone", () => {
        const referenceDate = new Date("2026-01-15T07:30:00.000Z");

        const result = getCurrentBudgetPeriodWindow({
            period: "daily",
            referenceDate,
            timeZone: "America/Los_Angeles",
            locale: "en-US",
        });

        expect(result.periodStart.toISOString()).toBe("2026-01-14T08:00:00.000Z");
        expect(result.periodEnd.toISOString()).toBe("2026-01-15T07:59:59.999Z");
    });

    it("should change weekly boundaries based on locale week start", () => {
        const referenceDate = new Date("2026-01-07T12:00:00.000Z");

        const usWeek = getCurrentBudgetPeriodWindow({
            period: "weekly",
            referenceDate,
            timeZone: "UTC",
            locale: "en-US",
        });

        const gbWeek = getCurrentBudgetPeriodWindow({
            period: "weekly",
            referenceDate,
            timeZone: "UTC",
            locale: "en-GB",
        });

        expect(usWeek.periodStart.toISOString()).toBe("2026-01-04T00:00:00.000Z");
        expect(usWeek.periodEnd.toISOString()).toBe("2026-01-10T23:59:59.999Z");

        expect(gbWeek.periodStart.toISOString()).toBe("2026-01-05T00:00:00.000Z");
        expect(gbWeek.periodEnd.toISOString()).toBe("2026-01-11T23:59:59.999Z");
    });

    it("should support monthly and yearly periods", () => {
        const referenceDate = new Date("2026-07-20T10:45:00.000Z");

        const monthly = getCurrentBudgetPeriodWindow({
            period: "monthly",
            referenceDate,
            timeZone: "UTC",
        });

        const yearly = getCurrentBudgetPeriodWindow({
            period: "yearly",
            referenceDate,
            timeZone: "UTC",
        });

        expect(monthly.periodStart.toISOString()).toBe("2026-07-01T00:00:00.000Z");
        expect(monthly.periodEnd.toISOString()).toBe("2026-07-31T23:59:59.999Z");

        expect(yearly.periodStart.toISOString()).toBe("2026-01-01T00:00:00.000Z");
        expect(yearly.periodEnd.toISOString()).toBe("2026-12-31T23:59:59.999Z");
    });

    it("should keep monthly boundaries stable across timezone date rollovers", () => {
        const referenceDate = new Date("2026-03-31T23:30:00.000Z");

        const tokyoMonth = getCurrentBudgetPeriodWindow({
            period: "monthly",
            referenceDate,
            timeZone: "Asia/Tokyo",
            locale: "ja-JP",
        });

        expect(tokyoMonth.periodStart.toISOString()).toBe("2026-03-31T15:00:00.000Z");
        expect(tokyoMonth.periodEnd.toISOString()).toBe("2026-04-30T14:59:59.999Z");
    });
});

describe("getBudgetPeriodWindow (periodOffset)", () => {
    it("is identical to the current window at offset 0", () => {
        const referenceDate = new Date("2026-07-20T10:45:00.000Z");

        const current = getCurrentBudgetPeriodWindow({
            period: "monthly",
            referenceDate,
            timeZone: "UTC",
        });
        const offsetZero = getBudgetPeriodWindow({
            period: "monthly",
            referenceDate,
            periodOffset: 0,
            timeZone: "UTC",
        });

        expect(offsetZero).toEqual(current);
    });

    it("steps monthly windows backward by calendar month", () => {
        const referenceDate = new Date("2026-07-20T10:45:00.000Z");

        const prev = getBudgetPeriodWindow({
            period: "monthly",
            referenceDate,
            periodOffset: -1,
            timeZone: "UTC",
        });

        expect(prev.periodStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
        expect(prev.periodEnd.toISOString()).toBe("2026-06-30T23:59:59.999Z");
    });

    it("handles short-month rollover when stepping monthly (Mar 31 -1 => February)", () => {
        const referenceDate = new Date("2026-03-31T12:00:00.000Z");

        const prev = getBudgetPeriodWindow({
            period: "monthly",
            referenceDate,
            periodOffset: -1,
            timeZone: "UTC",
        });

        expect(prev.periodStart.toISOString()).toBe("2026-02-01T00:00:00.000Z");
        expect(prev.periodEnd.toISOString()).toBe("2026-02-28T23:59:59.999Z");
    });

    it("crosses the year boundary when stepping monthly backward", () => {
        const referenceDate = new Date("2026-01-10T12:00:00.000Z");

        const prev = getBudgetPeriodWindow({
            period: "monthly",
            referenceDate,
            periodOffset: -1,
            timeZone: "UTC",
        });

        expect(prev.periodStart.toISOString()).toBe("2025-12-01T00:00:00.000Z");
        expect(prev.periodEnd.toISOString()).toBe("2025-12-31T23:59:59.999Z");
    });

    it("steps weekly windows backward by seven days", () => {
        const referenceDate = new Date("2026-01-07T12:00:00.000Z");

        const prevWeek = getBudgetPeriodWindow({
            period: "weekly",
            referenceDate,
            periodOffset: -1,
            timeZone: "UTC",
            locale: "en-US",
        });

        expect(prevWeek.periodStart.toISOString()).toBe("2025-12-28T00:00:00.000Z");
        expect(prevWeek.periodEnd.toISOString()).toBe("2026-01-03T23:59:59.999Z");
    });

    it("steps daily windows backward by one day", () => {
        const referenceDate = new Date("2026-01-01T12:00:00.000Z");

        const prevDay = getBudgetPeriodWindow({
            period: "daily",
            referenceDate,
            periodOffset: -1,
            timeZone: "UTC",
        });

        expect(prevDay.periodStart.toISOString()).toBe("2025-12-31T00:00:00.000Z");
        expect(prevDay.periodEnd.toISOString()).toBe("2025-12-31T23:59:59.999Z");
    });

    it("steps yearly windows backward by one year", () => {
        const referenceDate = new Date("2026-07-20T10:45:00.000Z");

        const prevYear = getBudgetPeriodWindow({
            period: "yearly",
            referenceDate,
            periodOffset: -1,
            timeZone: "UTC",
        });

        expect(prevYear.periodStart.toISOString()).toBe("2025-01-01T00:00:00.000Z");
        expect(prevYear.periodEnd.toISOString()).toBe("2025-12-31T23:59:59.999Z");
    });
});
