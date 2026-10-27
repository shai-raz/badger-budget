import { describe, expect, it } from "vitest";
import {
    addMonths,
    applyGridEmit,
    canStepNext,
    currentMonthSelection,
    isCurrentMonthSelection,
    isYearAligned,
    lastDayOfMonth,
    matchPreset,
    monthBandCell,
    monthCount,
    monthIndex,
    monthKeyLabel,
    monthKeyOf,
    monthPickHint,
    parseMonthKey,
    parseSelectionQuery,
    PERIOD_PRESET_LABELS,
    presetSelection,
    rangeFromEnds,
    REPORTS_PRESETS,
    selectionLabel,
    selectionToDateBounds,
    selectionToQuery,
    stepRange,
    TRANSACTIONS_PRESETS,
    type MonthRange,
    type PeriodSelection,
} from "./monthRange";

// Oct 26 2026 — the fixed "now" for these tests unless noted.
const NOW = new Date(2026, 9, 26);
const range = (from: string, to: string): MonthRange => ({ kind: "range", from, to });

describe("preset constants", () => {
    it("lists all seven presets for transactions, in order", () => {
        expect(TRANSACTIONS_PRESETS).toEqual([
            "this-month",
            "last-month",
            "last-3-months",
            "last-12-months",
            "year-to-date",
            "last-year",
            "all-time",
        ]);
    });

    it("drops all-time for reports and keeps the rest in order", () => {
        expect(REPORTS_PRESETS).toEqual(TRANSACTIONS_PRESETS.slice(0, 6));
    });

    it("labels every preset", () => {
        expect(PERIOD_PRESET_LABELS).toEqual({
            "this-month": "This month",
            "last-month": "Last month",
            "last-3-months": "Last 3 months",
            "last-12-months": "Last 12 months",
            "year-to-date": "Year to date",
            "last-year": "Last year",
            "all-time": "All time",
        });
    });
});

describe("lastDayOfMonth", () => {
    it("handles 30- and 31-day months", () => {
        expect(lastDayOfMonth(2026, 4)).toBe(30);
        expect(lastDayOfMonth(2026, 12)).toBe(31);
    });

    it("handles February in leap and non-leap years", () => {
        expect(lastDayOfMonth(2028, 2)).toBe(29);
        expect(lastDayOfMonth(2026, 2)).toBe(28);
    });

    it("applies the century rules", () => {
        expect(lastDayOfMonth(1900, 2)).toBe(28);
        expect(lastDayOfMonth(2000, 2)).toBe(29);
    });
});

describe("monthKeyOf", () => {
    it("formats the local year and month, zero-padded", () => {
        expect(monthKeyOf(new Date(2026, 9, 26))).toBe("2026-10");
        expect(monthKeyOf(new Date(2026, 0, 1))).toBe("2026-01");
    });
});

describe("parseMonthKey", () => {
    it("parses a valid key", () => {
        expect(parseMonthKey("2026-10")).toEqual({ year: 2026, month: 10 });
    });

    it.each([
        ["month 13", "2026-13"],
        ["month 00", "2026-00"],
        ["unpadded month", "2026-1"],
        ["two-digit year", "26-10"],
        ["full date", "2026-10-01"],
        ["empty string", ""],
    ])("rejects %s", (_label, value) => {
        expect(parseMonthKey(value)).toBeNull();
    });

    it.each([
        ["a number", 202610],
        ["undefined", undefined],
        ["null", null],
        ["an array", ["2026-10"]],
    ])("rejects non-strings (%s)", (_label, value) => {
        expect(parseMonthKey(value)).toBeNull();
    });
});

describe("month arithmetic", () => {
    it("adds and subtracts months across year boundaries", () => {
        expect(addMonths("2026-01", -1)).toBe("2025-12");
        expect(addMonths("2026-10", 3)).toBe("2027-01");
        expect(addMonths("2026-10", 0)).toBe("2026-10");
    });

    it("counts months from an absolute index", () => {
        expect(monthIndex("2026-10")).toBe(2026 * 12 + 9);
        expect(monthIndex("2026-11") - monthIndex("2026-10")).toBe(1);
    });

    it("counts months inclusively", () => {
        expect(monthCount(range("2026-08", "2026-10"))).toBe(3);
        expect(monthCount(range("2026-01", "2026-01"))).toBe(1);
        expect(monthCount(range("2025-11", "2026-10"))).toBe(12);
    });

    it("orders the two ends of a range", () => {
        expect(rangeFromEnds("2026-10", "2026-08")).toEqual(range("2026-08", "2026-10"));
        expect(rangeFromEnds("2026-08", "2026-10")).toEqual(range("2026-08", "2026-10"));
        expect(rangeFromEnds("2026-05", "2026-05")).toEqual(range("2026-05", "2026-05"));
    });

    it("builds the current-month selection", () => {
        expect(currentMonthSelection(NOW)).toEqual(range("2026-10", "2026-10"));
    });
});

describe("presetSelection", () => {
    it.each([
        ["this-month", range("2026-10", "2026-10")],
        ["last-month", range("2026-09", "2026-09")],
        ["last-3-months", range("2026-08", "2026-10")],
        ["last-12-months", range("2025-11", "2026-10")],
        ["year-to-date", range("2026-01", "2026-10")],
        ["last-year", range("2025-01", "2025-12")],
    ] as const)("%s", (id, expected) => {
        expect(presetSelection(id, NOW)).toEqual(expected);
    });

    it("all-time is the all selection", () => {
        expect(presetSelection("all-time", NOW)).toEqual({ kind: "all" });
    });
});

describe("matchPreset", () => {
    it("matches a preset selection", () => {
        expect(matchPreset(range("2026-08", "2026-10"), TRANSACTIONS_PRESETS, NOW)).toBe("last-3-months");
    });

    it("returns null for a custom selection", () => {
        expect(matchPreset(range("2026-07", "2026-09"), TRANSACTIONS_PRESETS, NOW)).toBeNull();
    });

    it("matches all-time only when the preset list includes it", () => {
        const all: PeriodSelection = { kind: "all" };
        expect(matchPreset(all, TRANSACTIONS_PRESETS, NOW)).toBe("all-time");
        expect(matchPreset(all, REPORTS_PRESETS, NOW)).toBeNull();
    });

    it("prefers this-month over year-to-date in January", () => {
        const jan = new Date(2026, 0, 15);
        expect(matchPreset(range("2026-01", "2026-01"), TRANSACTIONS_PRESETS, jan)).toBe("this-month");
    });
});

describe("stepping", () => {
    it("detects year-aligned ranges", () => {
        expect(isYearAligned(range("2026-01", "2026-12"))).toBe(true);
        expect(isYearAligned(range("2026-01", "2026-10"))).toBe(true);
        expect(isYearAligned(range("2026-01", "2026-01"))).toBe(false);
        expect(isYearAligned(range("2026-02", "2027-01"))).toBe(false);
    });

    it("steps a single January back by one month, not a year", () => {
        expect(stepRange(range("2026-01", "2026-01"), -1)).toEqual(range("2025-12", "2025-12"));
    });

    it("steps year-to-date back by a full year", () => {
        expect(stepRange(range("2026-01", "2026-10"), -1)).toEqual(range("2025-01", "2025-10"));
    });

    it("steps a three-month range back by its own length", () => {
        expect(stepRange(range("2026-08", "2026-10"), -1)).toEqual(range("2026-05", "2026-07"));
    });

    it("steps forward by the same amount", () => {
        expect(stepRange(range("2026-08", "2026-10"), 1)).toEqual(range("2026-11", "2027-01"));
    });

    it("cannot step next from this-month", () => {
        expect(canStepNext(range("2026-10", "2026-10"), NOW)).toBe(false);
    });

    it("can step next from last-month", () => {
        expect(canStepNext(range("2026-09", "2026-09"), NOW)).toBe(true);
    });

    it("cannot step next from year-to-date", () => {
        expect(canStepNext(range("2026-01", "2026-10"), NOW)).toBe(false);
    });

    it("detects the current-month selection", () => {
        expect(isCurrentMonthSelection(range("2026-10", "2026-10"), NOW)).toBe(true);
        expect(isCurrentMonthSelection(range("2026-09", "2026-09"), NOW)).toBe(false);
        expect(isCurrentMonthSelection({ kind: "all" }, NOW)).toBe(false);
    });
});

describe("selectionLabel", () => {
    const dash = "–";
    const apos = "’";

    it("labels all time", () => {
        expect(selectionLabel({ kind: "all" }, NOW, { shortYear: false })).toBe("All time");
    });

    it("labels a single month", () => {
        expect(selectionLabel(range("2026-10", "2026-10"), NOW, { shortYear: false })).toBe("Oct 2026");
        expect(selectionLabel(range("2026-10", "2026-10"), NOW, { shortYear: true })).toBe(`Oct ${apos}26`);
    });

    it("labels a range within one year", () => {
        expect(selectionLabel(range("2026-07", "2026-09"), NOW, { shortYear: false })).toBe(`Jul ${dash} Sep 2026`);
        expect(selectionLabel(range("2026-07", "2026-09"), NOW, { shortYear: true })).toBe(`Jul ${dash} Sep ${apos}26`);
    });

    it("labels a range across years", () => {
        expect(selectionLabel(range("2025-11", "2026-10"), NOW, { shortYear: false })).toBe(
            `Nov 2025 ${dash} Oct 2026`,
        );
        expect(selectionLabel(range("2025-11", "2026-10"), NOW, { shortYear: true })).toBe(
            `Nov ${apos}25 ${dash} Oct ${apos}26`,
        );
    });

    it("labels year-to-date with more than one month as YTD", () => {
        expect(selectionLabel(range("2026-01", "2026-10"), NOW, { shortYear: false })).toBe("YTD 2026");
        expect(selectionLabel(range("2026-01", "2026-10"), NOW, { shortYear: true })).toBe(`YTD ${apos}26`);
    });

    it("labels a January-only range as a month, not YTD", () => {
        const jan = new Date(2026, 0, 15);
        expect(selectionLabel(range("2026-01", "2026-01"), jan, { shortYear: false })).toBe("Jan 2026");
    });
});

describe("parseSelectionQuery", () => {
    const opts = { allowAll: true, now: NOW };

    it("accepts a valid range up to the current month", () => {
        expect(parseSelectionQuery({ from: "2026-07", to: "2026-10" }, opts)).toEqual(range("2026-07", "2026-10"));
        expect(parseSelectionQuery({ from: "2026-10", to: "2026-10" }, opts)).toEqual(range("2026-10", "2026-10"));
    });

    it("accepts from=all when allowed", () => {
        expect(parseSelectionQuery({ from: "all" }, opts)).toEqual({ kind: "all" });
    });

    it("rejects from=all when not allowed", () => {
        expect(parseSelectionQuery({ from: "all" }, { allowAll: false, now: NOW })).toBeNull();
    });

    it("returns null for malformed months", () => {
        expect(parseSelectionQuery({ from: "2026-13", to: "2026-10" }, opts)).toBeNull();
        expect(parseSelectionQuery({ from: "2026-07", to: "garbage" }, opts)).toBeNull();
    });

    it("returns null when from is after to", () => {
        expect(parseSelectionQuery({ from: "2026-10", to: "2026-07" }, opts)).toBeNull();
    });

    it("returns null when to is in the future", () => {
        expect(parseSelectionQuery({ from: "2026-10", to: "2026-11" }, opts)).toBeNull();
    });

    it("returns null for arrays, numbers and missing values", () => {
        expect(parseSelectionQuery({ from: ["2026-07"], to: ["2026-10"] }, opts)).toBeNull();
        expect(parseSelectionQuery({ from: 202607, to: 202610 }, opts)).toBeNull();
        expect(parseSelectionQuery({}, opts)).toBeNull();
        expect(parseSelectionQuery({ from: "2026-07" }, opts)).toBeNull();
    });
});

describe("selectionToQuery", () => {
    it("serialises all time and ranges", () => {
        expect(selectionToQuery({ kind: "all" })).toEqual({ from: "all" });
        expect(selectionToQuery(range("2026-07", "2026-10"))).toEqual({ from: "2026-07", to: "2026-10" });
    });
});

describe("selectionToDateBounds", () => {
    it("returns no bounds for all time", () => {
        expect(selectionToDateBounds({ kind: "all" })).toEqual({});
    });

    it("spans the first day of the first month to the last day of the last month", () => {
        expect(selectionToDateBounds(range("2026-07", "2026-09"))).toEqual({
            startDate: "2026-07-01",
            endDate: "2026-09-30",
        });
    });

    it("uses the leap day in February of a leap year", () => {
        expect(selectionToDateBounds(range("2028-02", "2028-02"))).toEqual({
            startDate: "2028-02-01",
            endDate: "2028-02-29",
        });
    });
});

describe("applyGridEmit", () => {
    it("clears everything on a null emit and does not close", () => {
        expect(applyGridEmit("2026-07", null)).toEqual({ pendingStart: null, commit: null, close: false });
    });

    it("commits a first click as that single month, keeps it pending, and stays open", () => {
        expect(applyGridEmit(null, ["2026-07", null])).toEqual({
            pendingStart: "2026-07",
            commit: range("2026-07", "2026-07"),
            close: false,
        });
    });

    it("extends a pending start to a later month and closes", () => {
        expect(applyGridEmit("2026-07", ["2026-07", "2026-09"])).toEqual({
            pendingStart: null,
            commit: range("2026-07", "2026-09"),
            close: true,
        });
    });

    it("completes a range when the second click is earlier than the pending start", () => {
        expect(applyGridEmit("2026-09", ["2026-09", "2026-07"])).toEqual({
            pendingStart: null,
            commit: range("2026-07", "2026-09"),
            close: true,
        });
    });

    it("completes a range when the emit is [clicked, null] after an earlier pending start", () => {
        expect(applyGridEmit("2026-09", ["2026-07", null])).toEqual({
            pendingStart: null,
            commit: range("2026-07", "2026-09"),
            close: true,
        });
    });

    it("completes a range when the emit is [clicked, null] after a later pending start", () => {
        expect(applyGridEmit("2026-07", ["2026-09", null])).toEqual({
            pendingStart: null,
            commit: range("2026-07", "2026-09"),
            close: true,
        });
    });

    it("commits the pending month clicked again as a single-month range and closes", () => {
        expect(applyGridEmit("2026-07", ["2026-07", null])).toEqual({
            pendingStart: null,
            commit: range("2026-07", "2026-07"),
            close: true,
        });
    });

    it("commits the same month clicked twice as a single-month range and closes", () => {
        expect(applyGridEmit("2026-07", ["2026-07", "2026-07"])).toEqual({
            pendingStart: null,
            commit: range("2026-07", "2026-07"),
            close: true,
        });
    });

    it("clears the pending start and does not commit on [null, null]", () => {
        expect(applyGridEmit("2026-07", [null, null])).toEqual({ pendingStart: null, commit: null, close: false });
    });
});

describe("monthKeyLabel", () => {
    it("labels a month with its short name and full year", () => {
        expect(monthKeyLabel("2026-10")).toBe("Oct 2026");
        expect(monthKeyLabel("2026-01")).toBe("Jan 2026");
    });

    it("labels a month in a year boundary", () => {
        expect(monthKeyLabel("2025-12")).toBe("Dec 2025");
        expect(monthKeyLabel("2027-01")).toBe("Jan 2027");
    });
});

describe("monthPickHint", () => {
    it("says how to start when idle", () => {
        expect(monthPickHint(null, { touch: true })).toBe("Tap a month, or two for a range");
        expect(monthPickHint(null, { touch: false })).toBe("Pick a month, or two for a range");
    });

    it("names the pending month and the next action when pending", () => {
        expect(monthPickHint("2026-10", { touch: true })).toBe("Oct 2026 selected · tap another month to make a range");
        expect(monthPickHint("2026-10", { touch: false })).toBe(
            "Oct 2026 selected · pick another month to make a range",
        );
    });

    it("names a pending month across a year boundary", () => {
        expect(monthPickHint("2025-12", { touch: false })).toBe(
            "Dec 2025 selected · pick another month to make a range",
        );
    });
});

describe("monthBandCell", () => {
    // Column = monthOfYear % 3. Caps go on row edges only: a middle or end at a row start, a middle or start at a row end.
    const band = (from: string, to: string) => range(from, to);

    it("draws a Mar–Oct band with row caps where it wraps", () => {
        const b = band("2026-03", "2026-10");
        expect(monthBandCell(2026, 2, b, null)).toEqual({ role: "start", capLeft: false, capRight: true }); // Mar
        expect(monthBandCell(2026, 3, b, null)).toEqual({ role: "middle", capLeft: true, capRight: false }); // Apr
        expect(monthBandCell(2026, 4, b, null)).toEqual({ role: "middle", capLeft: false, capRight: false }); // May
        expect(monthBandCell(2026, 5, b, null)).toEqual({ role: "middle", capLeft: false, capRight: true }); // Jun
        expect(monthBandCell(2026, 6, b, null)).toEqual({ role: "middle", capLeft: true, capRight: false }); // Jul
        expect(monthBandCell(2026, 8, b, null)).toEqual({ role: "middle", capLeft: false, capRight: true }); // Sep
        expect(monthBandCell(2026, 9, b, null)).toEqual({ role: "end", capLeft: true, capRight: false }); // Oct
    });

    it("leaves the months outside the band with no role", () => {
        const b = band("2026-03", "2026-10");
        expect(monthBandCell(2026, 1, b, null)).toEqual({ role: "none", capLeft: false, capRight: false }); // Feb
        expect(monthBandCell(2026, 10, b, null)).toEqual({ role: "none", capLeft: false, capRight: false }); // Nov
    });

    it("gives a start and end inside one row no caps", () => {
        const b = band("2026-04", "2026-05");
        expect(monthBandCell(2026, 3, b, null)).toEqual({ role: "start", capLeft: false, capRight: false }); // Apr
        expect(monthBandCell(2026, 4, b, null)).toEqual({ role: "end", capLeft: false, capRight: false }); // May
    });

    it("draws a single-month range as a single", () => {
        expect(monthBandCell(2026, 6, band("2026-07", "2026-07"), null)).toEqual({
            role: "single",
            capLeft: false,
            capRight: false,
        });
    });

    it("shows the pending month alone, with no caps, while a start is pending", () => {
        const b = band("2026-07", "2026-07");
        expect(monthBandCell(2026, 6, b, "2026-07")).toEqual({ role: "pending", capLeft: false, capRight: false });
        expect(monthBandCell(2026, 7, b, "2026-07")).toEqual({ role: "none", capLeft: false, capRight: false }); // Aug
    });

    it("handles a range across a year change, viewing the later year", () => {
        const b = band("2025-11", "2026-02");
        expect(monthBandCell(2026, 0, b, null)).toEqual({ role: "middle", capLeft: true, capRight: false }); // Jan
        expect(monthBandCell(2026, 1, b, null)).toEqual({ role: "end", capLeft: false, capRight: false }); // Feb
        expect(monthBandCell(2026, 2, b, null)).toEqual({ role: "none", capLeft: false, capRight: false }); // Mar
    });

    it("handles a range across a year change, viewing the earlier year", () => {
        const b = band("2025-11", "2026-02");
        expect(monthBandCell(2025, 10, b, null)).toEqual({ role: "start", capLeft: false, capRight: false }); // Nov
        expect(monthBandCell(2025, 11, b, null)).toEqual({ role: "middle", capLeft: false, capRight: true }); // Dec
    });

    it("has no role without a band", () => {
        expect(monthBandCell(2026, 6, null, null)).toEqual({ role: "none", capLeft: false, capRight: false });
    });
});
