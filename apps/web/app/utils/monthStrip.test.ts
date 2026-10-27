import type { MonthlySpending } from "@badger/types";
import { describe, expect, it } from "vitest";
import type { MonthRange } from "./monthRange";
import {
    barHeightPercent,
    classifyGesture,
    clampWindowStart,
    edgeDirection,
    edgeZonePx,
    mergeMonthlyPages,
    monthAtOffset,
    pagesForWindow,
    previewRange,
    slideWindow,
    stripAverage,
    stripBounds,
    stripHint,
    stripMonthLabel,
    stripMonths,
    stripPageRange,
    STRIP_PAGE_SIZE,
    STRIP_SLIDE_STEP,
    tapMonth,
    windowToShow,
    type StripInteraction,
} from "./monthStrip";

// Oct 26 2026 — the fixed "now" for these tests.
const NOW = new Date(2026, 9, 26);
const range = (from: string, to: string): MonthRange => ({ kind: "range", from, to });

describe("stripBounds", () => {
    it("uses the newest start as the lowest start when there is no first month", () => {
        // 24 visible months ending Oct 2026 start Nov 2024.
        expect(stripBounds(null, "2026-10", 24)).toEqual({ lowestStart: "2024-11", highestStart: "2024-11" });
    });

    it("reaches back to an older first month", () => {
        expect(stripBounds("2020-03", "2026-10", 24)).toEqual({ lowestStart: "2020-03", highestStart: "2024-11" });
    });

    it("ignores a first month newer than the highest start", () => {
        expect(stripBounds("2025-01", "2026-10", 24)).toEqual({ lowestStart: "2024-11", highestStart: "2024-11" });
    });

    it("sizes the newest start to the visible count", () => {
        expect(stripBounds(null, "2026-10", 12)).toEqual({ lowestStart: "2025-11", highestStart: "2025-11" });
    });
});

describe("window movement", () => {
    const bounds = { lowestStart: "2020-03", highestStart: "2024-11" };

    it("clamps a start into the bounds at both ends", () => {
        expect(clampWindowStart("2019-01", bounds)).toBe("2020-03");
        expect(clampWindowStart("2026-01", bounds)).toBe("2024-11");
        expect(clampWindowStart("2022-05", bounds)).toBe("2022-05");
    });

    it("slides by the delta and stops at either end", () => {
        expect(slideWindow("2022-01", STRIP_SLIDE_STEP, bounds)).toBe("2022-07");
        expect(slideWindow("2022-01", -STRIP_SLIDE_STEP, bounds)).toBe("2021-07");
        expect(slideWindow("2024-08", STRIP_SLIDE_STEP, bounds)).toBe("2024-11");
        expect(slideWindow("2020-05", -STRIP_SLIDE_STEP, bounds)).toBe("2020-03");
    });

    describe("windowToShow with a 12-month window starting Jan 2023", () => {
        const windowBounds = { lowestStart: "2020-01", highestStart: "2024-11" };
        const start = "2023-01";

        it("leaves the window alone when the range is inside it", () => {
            expect(windowToShow(start, range("2023-03", "2023-05"), 12, windowBounds)).toBe("2023-01");
        });

        it("moves the window back just far enough when the range starts before it", () => {
            expect(windowToShow(start, range("2022-11", "2023-02"), 12, windowBounds)).toBe("2022-11");
        });

        it("moves the window forward just far enough when the range ends after it", () => {
            expect(windowToShow(start, range("2023-11", "2024-02"), 12, windowBounds)).toBe("2023-03");
        });

        it("aligns the window end to the range end when the range is longer than the window", () => {
            expect(windowToShow(start, range("2021-01", "2023-06"), 12, windowBounds)).toBe("2022-07");
        });

        it("clamps a longer-than-window range that would start before the lowest start", () => {
            const tight = { lowestStart: "2020-03", highestStart: "2024-11" };
            expect(windowToShow(start, range("2019-01", "2020-06"), 12, tight)).toBe("2020-03");
        });
    });
});

describe("stripMonths", () => {
    it("renders one month when lowest and highest coincide, plus the window length", () => {
        const months = stripMonths({ lowestStart: "2024-11", highestStart: "2024-11" }, 24);
        expect(months).toHaveLength(24);
        expect(months[0]).toBe("2024-11");
        expect(months[23]).toBe("2026-10");
    });

    it("runs from the lowest start through the end of the highest window", () => {
        const months = stripMonths({ lowestStart: "2020-03", highestStart: "2024-11" }, 24);
        expect(months).toHaveLength(80);
        expect(months[0]).toBe("2020-03");
        expect(months[79]).toBe("2026-10");
    });
});

describe("pointer geometry", () => {
    it("maps an x offset to the month under it", () => {
        expect(monthAtOffset(0, 240, "2024-11", 24)).toBe("2024-11");
        expect(monthAtOffset(239, 240, "2024-11", 24)).toBe("2026-10");
        expect(monthAtOffset(120, 240, "2024-11", 24)).toBe("2025-11");
    });

    it("clamps offsets outside the strip to the first and last visible month", () => {
        expect(monthAtOffset(-5, 240, "2024-11", 24)).toBe("2024-11");
        expect(monthAtOffset(500, 240, "2024-11", 24)).toBe("2026-10");
    });

    it("uses the visible count for mobile widths", () => {
        expect(monthAtOffset(120, 240, "2024-11", 12)).toBe("2025-05");
    });

    it("returns the first visible month when the width is zero", () => {
        expect(monthAtOffset(50, 0, "2024-11", 24)).toBe("2024-11");
    });

    it("reports which edge the pointer is within", () => {
        expect(edgeDirection(10, 300, 40)).toBe(-1);
        expect(edgeDirection(290, 300, 40)).toBe(1);
        expect(edgeDirection(150, 300, 40)).toBe(0);
        expect(edgeDirection(40, 300, 40)).toBe(0);
        expect(edgeDirection(260, 300, 40)).toBe(0);
    });

    it("caps the edge zone at half a month column on a narrow strip", () => {
        // 250px over 12 months: a column is about 21px, so the zone is half of it, not the 24px maximum.
        expect(edgeZonePx(250, 12, 24)).toBeCloseTo(250 / 24);
        // A wide strip keeps the full zone.
        expect(edgeZonePx(2000, 24, 24)).toBe(24);
    });

    it("classifies a gesture as horizontal, vertical or undecided", () => {
        expect(classifyGesture(0, 0)).toBe("undecided");
        expect(classifyGesture(5, 7)).toBe("undecided");
        expect(classifyGesture(-12, 4)).toBe("horizontal");
        expect(classifyGesture(3, -9)).toBe("vertical");
    });
});

describe("tap-tap selection", () => {
    const idle: StripInteraction = { kind: "idle" };

    it("sets a pending start from idle without committing", () => {
        expect(tapMonth(idle, "2026-03")).toEqual({
            interaction: { kind: "pending", start: "2026-03" },
            commit: null,
        });
    });

    it("commits the range from the pending start and returns to idle", () => {
        expect(tapMonth({ kind: "pending", start: "2026-03" }, "2026-06")).toEqual({
            interaction: { kind: "idle" },
            commit: range("2026-03", "2026-06"),
        });
    });

    it("commits in either order", () => {
        expect(tapMonth({ kind: "pending", start: "2026-06" }, "2026-03").commit).toEqual(range("2026-03", "2026-06"));
    });

    it("commits a single month when the same month is tapped twice", () => {
        expect(tapMonth({ kind: "pending", start: "2026-06" }, "2026-06")).toEqual({
            interaction: { kind: "idle" },
            commit: range("2026-06", "2026-06"),
        });
    });

    it("treats a tap during a drag as a new pending start", () => {
        expect(tapMonth({ kind: "dragging", anchor: "2026-01", current: "2026-04" }, "2026-08")).toEqual({
            interaction: { kind: "pending", start: "2026-08" },
            commit: null,
        });
    });
});

describe("previewRange", () => {
    it("previews from a pending start to the hovered month, in either order", () => {
        const pending: StripInteraction = { kind: "pending", start: "2026-05" };
        expect(previewRange(pending, "2026-08")).toEqual(range("2026-05", "2026-08"));
        expect(previewRange(pending, "2026-02")).toEqual(range("2026-02", "2026-05"));
    });

    it("previews nothing while pending with no hover", () => {
        expect(previewRange({ kind: "pending", start: "2026-05" }, null)).toBeNull();
    });

    it("previews the drag span in either direction", () => {
        expect(previewRange({ kind: "dragging", anchor: "2026-09", current: "2026-04" }, null)).toEqual(
            range("2026-04", "2026-09"),
        );
    });

    it("previews nothing when idle", () => {
        expect(previewRange({ kind: "idle" }, "2026-05")).toBeNull();
    });
});

describe("stripAverage", () => {
    const months = ["2024-12", "2025-01", "2025-02", "2025-03"];
    const totals = { "2024-12": 999, "2025-01": 100, "2025-02": 300, "2025-03": 0 };

    it("averages the totals from the first month onward", () => {
        expect(stripAverage(totals, months, "2025-01")).toBeCloseTo(400 / 3);
    });

    it("skips months with no loaded total", () => {
        expect(stripAverage({ "2025-02": 300 }, ["2025-01", "2025-02"], "2025-01")).toBe(300);
    });

    it("returns null with no first month", () => {
        expect(stripAverage(totals, months, null)).toBeNull();
    });

    it("returns null when the first month is after every month", () => {
        expect(stripAverage(totals, months, "2026-01")).toBeNull();
    });

    it("returns null when no month has a loaded total", () => {
        expect(stripAverage({}, months, "2025-01")).toBeNull();
    });
});

describe("barHeightPercent", () => {
    it("scales a total against the max", () => {
        expect(barHeightPercent(50, 100)).toBe(50);
    });

    it("caps at 100", () => {
        expect(barHeightPercent(200, 100)).toBe(100);
    });

    it("keeps a non-zero total at least 2% tall", () => {
        expect(barHeightPercent(1, 1000)).toBe(2);
    });

    it("gives zero for a zero total or a zero max", () => {
        expect(barHeightPercent(0, 100)).toBe(0);
        expect(barHeightPercent(5, 0)).toBe(0);
        expect(barHeightPercent(0, 0)).toBe(0);
    });
});

describe("stripMonthLabel", () => {
    it("shows the year only for January", () => {
        expect(stripMonthLabel("2026-01")).toEqual({ month: "Jan", year: "2026" });
        expect(stripMonthLabel("2026-10")).toEqual({ month: "Oct", year: null });
    });
});

describe("stripHint", () => {
    const idle: StripInteraction = { kind: "idle" };
    const pending: StripInteraction = { kind: "pending", start: "2026-03" };
    const dragging: StripInteraction = { kind: "dragging", anchor: "2026-03", current: "2026-06" };

    it("shows the idle hint for each layout", () => {
        expect(stripHint(idle, { mobile: false, dragLabel: null })).toEqual({
            kind: "meta",
            text: "Click or drag to select months",
        });
        expect(stripHint(idle, { mobile: true, dragLabel: null })).toEqual({
            kind: "meta",
            text: "Tap or drag to select months",
        });
    });

    it("shows the pending tag for each layout", () => {
        expect(stripHint(pending, { mobile: false, dragLabel: null })).toEqual({
            kind: "tag",
            text: "Select end month",
        });
        expect(stripHint(pending, { mobile: true, dragLabel: null })).toEqual({ kind: "tag", text: "Tap end month" });
    });

    it("shows the drag label while dragging", () => {
        expect(stripHint(dragging, { mobile: false, dragLabel: "Mar – Jun 2026" })).toEqual({
            kind: "meta",
            text: "Mar – Jun 2026",
        });
    });

    it("falls back to the idle hint while dragging with no label", () => {
        expect(stripHint(dragging, { mobile: true, dragLabel: null })).toEqual({
            kind: "meta",
            text: "Tap or drag to select months",
        });
    });
});

describe("stripPageRange", () => {
    it("ends page 0 at the current month and spans one page", () => {
        expect(stripPageRange(0, NOW)).toEqual({ startMonth: "2024-11", endMonth: "2026-10" });
    });

    it("places page 1 one page size earlier, from current-47 to current-24", () => {
        expect(stripPageRange(1, NOW)).toEqual({ startMonth: "2022-11", endMonth: "2024-10" });
    });

    it("uses the page size", () => {
        expect(STRIP_PAGE_SIZE).toBe(24);
    });
});

describe("pagesForWindow", () => {
    it("loads only the current page when the window and its buffer stay inside it", () => {
        // Mobile window Nov 2025 – Oct 2026; buffer reaches May 2025, still page 0.
        expect(pagesForWindow("2025-11", 12, "2026-10")).toEqual([0]);
    });

    it("includes the older page when the buffer crosses a page boundary", () => {
        // Window Mar 2024 – Feb 2025; buffer reaches Sep 2023, which is on page 1.
        expect(pagesForWindow("2024-03", 12, "2026-10")).toEqual([0, 1]);
    });

    it("loads only an older page when the window and its buffer both sit inside it", () => {
        // Window Jun 2023 – May 2024 with buffer from Dec 2022: all on page 1 (Nov 2022 – Oct 2024).
        expect(pagesForWindow("2023-06", 12, "2026-10")).toEqual([1]);
    });

    it("includes the page holding the buffer when the window's buffer reaches further back", () => {
        // Window Jan 2023 – Dec 2023; buffer reaches Jul 2022, on page 2.
        expect(pagesForWindow("2023-01", 12, "2026-10")).toEqual([1, 2]);
    });

    it("loads both pages for the desktop window at its oldest-reachable start", () => {
        expect(pagesForWindow("2024-11", 24, "2026-10")).toEqual([0, 1]);
    });

    it("never returns a page in the future when the window ends after now", () => {
        // Relative to Oct 2025, the window Nov 2025 – Oct 2026 runs into the future.
        expect(pagesForWindow("2025-11", 12, "2025-10")).toEqual([0]);
    });
});

describe("mergeMonthlyPages", () => {
    const page = (months: [string, number][], firstMonth: string | null): MonthlySpending => ({
        startMonth: months[0]?.[0] ?? "",
        endMonth: months[months.length - 1]?.[0] ?? "",
        currency: { code: "USD", symbol: "$" },
        months: months.map(([month, total]) => ({ month, total, transactionCount: 0 })),
        firstMonth,
    });

    it("merges page totals and takes the first month from a loaded page", () => {
        const merged = mergeMonthlyPages([
            undefined,
            page(
                [
                    ["2024-10", 100],
                    ["2024-11", 50],
                ],
                "2024-10",
            ),
        ]);
        expect(merged).toEqual({ totals: { "2024-10": 100, "2024-11": 50 }, firstMonth: "2024-10" });
    });

    it("skips undefined pages and returns empty totals with no first month", () => {
        expect(mergeMonthlyPages([undefined, undefined])).toEqual({ totals: {}, firstMonth: null });
    });

    it("keeps the earliest known first month across pages", () => {
        const merged = mergeMonthlyPages([page([["2024-11", 1]], null), page([["2022-11", 2]], "2020-01")]);
        expect(merged.firstMonth).toBe("2020-01");
        expect(merged.totals).toEqual({ "2024-11": 1, "2022-11": 2 });
    });
});
