import {
    toDateOnly,
    addDaysUtc,
    startOfMonthUtc,
    endOfMonthUtc,
    demoWindowStart,
    demoSalaryDay,
    demoAtmDay,
    nextUpcomingDebitDate,
} from "./demo-dates";

describe("toDateOnly", () => {
    it("returns UTC midnight of the date's local calendar day", () => {
        const d = new Date(2026, 2, 15, 23, 45); // local: 2026-03-15 23:45
        const result = toDateOnly(d);
        expect(result.getUTCFullYear()).toBe(2026);
        expect(result.getUTCMonth()).toBe(2);
        expect(result.getUTCDate()).toBe(15);
        expect(result.getUTCHours()).toBe(0);
        expect(result.getUTCMinutes()).toBe(0);
    });
});

describe("addDaysUtc", () => {
    it("adds days, rolling over month/year boundaries", () => {
        const d = new Date(Date.UTC(2026, 0, 30));
        expect(addDaysUtc(d, 3).toISOString()).toBe(new Date(Date.UTC(2026, 1, 2)).toISOString());
    });

    it("supports negative offsets", () => {
        const d = new Date(Date.UTC(2026, 0, 1));
        expect(addDaysUtc(d, -1).toISOString()).toBe(new Date(Date.UTC(2025, 11, 31)).toISOString());
    });
});

describe("startOfMonthUtc / endOfMonthUtc", () => {
    it("returns the first and last day of the UTC month", () => {
        const d = new Date(Date.UTC(2026, 3, 17));
        expect(startOfMonthUtc(d).toISOString()).toBe(new Date(Date.UTC(2026, 3, 1)).toISOString());
        expect(endOfMonthUtc(d).toISOString()).toBe(new Date(Date.UTC(2026, 3, 30)).toISOString());
    });

    it("handles a leap-year February", () => {
        const d = new Date(Date.UTC(2024, 1, 10));
        expect(endOfMonthUtc(d).getUTCDate()).toBe(29);
    });

    it("handles a non-leap-year February", () => {
        const d = new Date(Date.UTC(2026, 1, 10));
        expect(endOfMonthUtc(d).getUTCDate()).toBe(28);
    });
});

describe("demoWindowStart", () => {
    it("is the first of the month 11 months before January", () => {
        const today = new Date(Date.UTC(2026, 0, 15));
        expect(demoWindowStart(today).toISOString()).toBe(new Date(Date.UTC(2025, 1, 1)).toISOString());
    });

    it("is the first of the month 11 months before September", () => {
        const today = new Date(Date.UTC(2026, 8, 25));
        expect(demoWindowStart(today).toISOString()).toBe(new Date(Date.UTC(2025, 9, 1)).toISOString());
    });
});

describe("demoSalaryDay", () => {
    it("always falls within 1..5", () => {
        for (let year = 2020; year <= 2030; year++) {
            for (let month = 0; month < 12; month++) {
                const day = demoSalaryDay(year, month);
                expect(day).toBeGreaterThanOrEqual(1);
                expect(day).toBeLessThanOrEqual(5);
            }
        }
    });

    it("differs across most consecutive months (deterministic, not constant)", () => {
        const days = Array.from({ length: 12 }, (_, i) => demoSalaryDay(2026, i));
        const distinct = new Set(days);
        expect(distinct.size).toBeGreaterThan(1);
    });

    it("is deterministic for the same year/month", () => {
        expect(demoSalaryDay(2026, 5)).toBe(demoSalaryDay(2026, 5));
    });
});

describe("nextUpcomingDebitDate", () => {
    it("returns this month's day when it hasn't passed yet", () => {
        const today = new Date(Date.UTC(2026, 2, 10));
        expect(nextUpcomingDebitDate(today, 15).toISOString()).toBe(new Date(Date.UTC(2026, 2, 15)).toISOString());
    });

    it("returns this month's day when it's today", () => {
        const today = new Date(Date.UTC(2026, 2, 15));
        expect(nextUpcomingDebitDate(today, 15).toISOString()).toBe(new Date(Date.UTC(2026, 2, 15)).toISOString());
    });

    it("counts today as upcoming even for a mid-day timestamp", () => {
        const now = new Date(2026, 2, 15, 14, 30); // local 2026-03-15 14:30
        expect(nextUpcomingDebitDate(now, 15).toISOString()).toBe(new Date(Date.UTC(2026, 2, 15)).toISOString());
    });

    it("rolls to next month when the day has already passed", () => {
        const today = new Date(Date.UTC(2026, 2, 20));
        expect(nextUpcomingDebitDate(today, 15).toISOString()).toBe(new Date(Date.UTC(2026, 3, 15)).toISOString());
    });

    it("rolls over a year boundary", () => {
        const today = new Date(Date.UTC(2026, 11, 20));
        expect(nextUpcomingDebitDate(today, 15).toISOString()).toBe(new Date(Date.UTC(2027, 0, 15)).toISOString());
    });
});

describe("demoAtmDay", () => {
    it("is deterministic, within 6..25, and avoids the salary days and the payoff day", () => {
        for (let year = 2024; year <= 2028; year++) {
            for (let month = 0; month < 12; month++) {
                const day = demoAtmDay(year, month);
                expect(day).toBe(demoAtmDay(year, month));
                expect(day).toBeGreaterThanOrEqual(6);
                expect(day).toBeLessThanOrEqual(25);
                expect(day).not.toBe(15);
                expect(day).not.toBe(demoSalaryDay(year, month));
            }
        }
    });
});
