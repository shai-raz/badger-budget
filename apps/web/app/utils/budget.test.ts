import { describe, expect, it } from "vitest";
import {
    BUDGET_LEVEL_COLOR,
    BUDGET_LEVEL_TEXT_CLASS,
    budgetCurrentPeriodLabel,
    budgetDaysLeftLabel,
    budgetPeriodLabel,
    budgetPeriodNoun,
    budgetProgressLevel,
    budgetWindowLabel,
    formatDaysLeft,
    inferWindowOffsetMinutes,
} from "./budget";

describe("budgetPeriodLabel", () => {
    it("maps each period to its display label", () => {
        expect(budgetPeriodLabel("daily")).toBe("Daily");
        expect(budgetPeriodLabel("weekly")).toBe("Weekly");
        expect(budgetPeriodLabel("monthly")).toBe("Monthly");
        expect(budgetPeriodLabel("yearly")).toBe("Yearly");
    });
});

describe("budgetProgressLevel", () => {
    it.each([
        [0, "ok"],
        [74.9, "ok"],
        [75, "warning"],
        [99.9, "warning"],
        [100, "over"],
        [150, "over"],
    ] as const)("pct=%s -> %s", (pct, level) => {
        expect(budgetProgressLevel(pct)).toBe(level);
    });
});

describe("BUDGET_LEVEL_COLOR", () => {
    it("has green, amber and red progress fills", () => {
        expect(BUDGET_LEVEL_COLOR).toEqual({ ok: "#10b981", warning: "#f59e0b", over: "#ef4444" });
    });
});

describe("BUDGET_LEVEL_TEXT_CLASS", () => {
    it("keeps the inherited colour when ok, then amber and rose", () => {
        expect(BUDGET_LEVEL_TEXT_CLASS).toEqual({ ok: "", warning: "text-amber-500", over: "text-rose-500" });
    });
});

describe("formatDaysLeft", () => {
    it("says Ends today for 0", () => {
        expect(formatDaysLeft(0)).toBe("Ends today");
    });

    it("uses singular for 1", () => {
        expect(formatDaysLeft(1)).toBe("1 day left");
    });

    it("uses plural for N", () => {
        expect(formatDaysLeft(5)).toBe("5 days left");
    });
});

describe("budgetDaysLeftLabel", () => {
    // periodEnd is the inclusive end of the last day, 23:59:59.999 local (see
    // apps/api's budget-period.util.ts) — not an arbitrary elapsed-ms boundary.
    const periodEnd = "2026-06-15T23:59:59.999";

    it("says Ends today at any hour of the period's last calendar day", () => {
        expect(budgetDaysLeftLabel(periodEnd, new Date("2026-06-15T00:00:01"))).toBe("Ends today");
        expect(budgetDaysLeftLabel(periodEnd, new Date("2026-06-15T23:59:59.999"))).toBe("Ends today");
    });

    it("says 1 day left the day before, for a daily budget too", () => {
        expect(budgetDaysLeftLabel(periodEnd, new Date("2026-06-14T09:00:00"))).toBe("1 day left");
    });

    it("never goes negative once the period has passed", () => {
        expect(budgetDaysLeftLabel(periodEnd, new Date("2026-06-17T00:00:00"))).toBe("Ends today");
    });
});

describe("inferWindowOffsetMinutes", () => {
    it.each([
        ["2026-10-01T00:00:00.000Z", 0],
        ["2026-09-30T21:00:00.000Z", 180],
        ["2026-10-01T23:00:00.000Z", 60],
        ["2026-10-11T07:00:00.000Z", -420],
        ["2026-10-11T10:00:00.000Z", -600],
    ])("start %s -> %s minutes", (start, minutes) => {
        expect(inferWindowOffsetMinutes(start)).toBe(minutes);
    });
});

describe("budgetPeriodNoun", () => {
    it("maps each period to its noun", () => {
        expect(budgetPeriodNoun("daily")).toBe("day");
        expect(budgetPeriodNoun("weekly")).toBe("week");
        expect(budgetPeriodNoun("monthly")).toBe("month");
        expect(budgetPeriodNoun("yearly")).toBe("year");
    });
});

describe("budgetCurrentPeriodLabel", () => {
    it("maps each period to its current-window label", () => {
        expect(budgetCurrentPeriodLabel("daily")).toBe("Today");
        expect(budgetCurrentPeriodLabel("weekly")).toBe("This week");
        expect(budgetCurrentPeriodLabel("monthly")).toBe("This month");
        expect(budgetCurrentPeriodLabel("yearly")).toBe("This year");
    });
});

describe("budgetWindowLabel", () => {
    const NOW = new Date("2026-10-14T12:00:00.000Z");

    describe("monthly", () => {
        it("reads a UTC month as its own month, not the previous or next one (non-UTC browser zone)", () => {
            expect(
                budgetWindowLabel("monthly", "2026-10-01T00:00:00.000Z", "2026-10-31T23:59:59.999Z", { now: NOW }),
            ).toBe("Oct 2026");
        });

        it("reads a UTC+3 window as its local month", () => {
            expect(
                budgetWindowLabel("monthly", "2026-09-30T21:00:00.000Z", "2026-10-31T20:59:59.999Z", { now: NOW }),
            ).toBe("Oct 2026");
        });

        it("uses the full month name in the long style", () => {
            expect(
                budgetWindowLabel("monthly", "2026-10-01T00:00:00.000Z", "2026-10-31T23:59:59.999Z", {
                    now: NOW,
                    style: "long",
                }),
            ).toBe("October 2026");
        });

        it("always shows the year, even for a past year", () => {
            expect(
                budgetWindowLabel("monthly", "2025-10-01T00:00:00.000Z", "2025-10-31T23:59:59.999Z", { now: NOW }),
            ).toBe("Oct 2025");
        });
    });

    describe("weekly", () => {
        it("uses an en dash and day numbers for a same-month week in a UTC- zone", () => {
            expect(
                budgetWindowLabel("weekly", "2026-10-11T07:00:00.000Z", "2026-10-18T06:59:59.999Z", { now: NOW }),
            ).toBe("Oct 11–17");
        });

        // New York falls back on Nov 1 2026: the week's end is EST (-300) while its start is EDT (-240).
        // Reading the end with the start's offset ran the label into Nov 8.
        it("ends on the local last day when the window crosses a DST fall-back", () => {
            expect(
                budgetWindowLabel("weekly", "2026-11-01T04:00:00.000Z", "2026-11-08T04:59:59.999Z", { now: NOW }),
            ).toBe("Nov 1–7");
        });

        it("spells out both months for a cross-month week", () => {
            expect(
                budgetWindowLabel("weekly", "2026-09-28T00:00:00.000Z", "2026-10-04T23:59:59.999Z", { now: NOW }),
            ).toBe("Sep 28 – Oct 4");
        });

        it("appends the year when it differs from now", () => {
            expect(
                budgetWindowLabel("weekly", "2025-10-11T00:00:00.000Z", "2025-10-17T23:59:59.999Z", { now: NOW }),
            ).toBe("Oct 11–17, 2025");
        });

        it("shows both years for a week that crosses a year boundary", () => {
            expect(
                budgetWindowLabel("weekly", "2025-12-29T00:00:00.000Z", "2026-01-04T23:59:59.999Z", { now: NOW }),
            ).toBe("Dec 29, 2025 – Jan 4, 2026");
        });

        it("uses full month names and the year in the long style", () => {
            expect(
                budgetWindowLabel("weekly", "2026-10-11T00:00:00.000Z", "2026-10-17T23:59:59.999Z", {
                    now: NOW,
                    style: "long",
                }),
            ).toBe("October 11 – 17, 2026");
            expect(
                budgetWindowLabel("weekly", "2026-09-28T00:00:00.000Z", "2026-10-04T23:59:59.999Z", {
                    now: NOW,
                    style: "long",
                }),
            ).toBe("September 28 – October 4, 2026");
            expect(
                budgetWindowLabel("weekly", "2025-12-29T00:00:00.000Z", "2026-01-04T23:59:59.999Z", {
                    now: NOW,
                    style: "long",
                }),
            ).toBe("December 29, 2025 – January 4, 2026");
        });
    });

    describe("daily", () => {
        it("shows the day without a year in the current year", () => {
            expect(
                budgetWindowLabel("daily", "2026-10-14T00:00:00.000Z", "2026-10-14T23:59:59.999Z", { now: NOW }),
            ).toBe("Oct 14");
        });

        it("appends the year when it differs from now", () => {
            expect(
                budgetWindowLabel("daily", "2025-10-14T00:00:00.000Z", "2025-10-14T23:59:59.999Z", { now: NOW }),
            ).toBe("Oct 14, 2025");
        });

        it("always shows the year in the long style", () => {
            expect(
                budgetWindowLabel("daily", "2026-10-14T00:00:00.000Z", "2026-10-14T23:59:59.999Z", {
                    now: NOW,
                    style: "long",
                }),
            ).toBe("October 14, 2026");
        });
    });

    describe("yearly", () => {
        it("labels a window by its year in both styles", () => {
            expect(
                budgetWindowLabel("yearly", "2026-01-01T00:00:00.000Z", "2026-12-31T23:59:59.999Z", { now: NOW }),
            ).toBe("2026");
            expect(
                budgetWindowLabel("yearly", "2026-01-01T00:00:00.000Z", "2026-12-31T23:59:59.999Z", {
                    now: NOW,
                    style: "long",
                }),
            ).toBe("2026");
        });
    });
});
