/**
 * Pure month-range logic for the shared period picker. Every date is built from
 * local parts (never `toISOString()`), and anything that depends on "now" takes
 * `now: Date` as a parameter so it stays testable.
 */
import type { ReportCompareMode } from "@badger/types";
import { toLocalIsoDate } from "./localDate";

/** A calendar month as zero-padded `YYYY-MM`, e.g. `2026-10`. Lexicographic order is chronological order. */
export type MonthKey = string;

export interface MonthRange {
    kind: "range";
    /** First month, inclusive. */
    from: MonthKey;
    /** Last month, inclusive. */
    to: MonthKey;
}

export type PeriodSelection = MonthRange | { kind: "all" };

export type PeriodPresetId =
    | "this-month"
    | "last-month"
    | "last-3-months"
    | "last-12-months"
    | "year-to-date"
    | "last-year"
    | "all-time";

export const TRANSACTIONS_PRESETS: readonly PeriodPresetId[] = [
    "this-month",
    "last-month",
    "last-3-months",
    "last-12-months",
    "year-to-date",
    "last-year",
    "all-time",
];

export const REPORTS_PRESETS: readonly PeriodPresetId[] = TRANSACTIONS_PRESETS.filter((id) => id !== "all-time");

export const PERIOD_PRESET_LABELS: Record<PeriodPresetId, string> = {
    "this-month": "This month",
    "last-month": "Last month",
    "last-3-months": "Last 3 months",
    "last-12-months": "Last 12 months",
    "year-to-date": "Year to date",
    "last-year": "Last year",
    "all-time": "All time",
};

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const APOSTROPHE = "’";
const EN_DASH = "–";

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad4 = (n: number) => String(n).padStart(4, "0");

function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Days in a month (`month` is 1-based). Pure arithmetic on purpose: `new Date(y, m, 0)`
 * maps years 0–99 to 1900+, which would be wrong for those years.
 */
export function lastDayOfMonth(year: number, month: number): number {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function formatKey(year: number, month: number): MonthKey {
    return `${pad4(year)}-${pad2(month)}`;
}

/** The `YYYY-MM` key of the local calendar month containing `date`. */
export function monthKeyOf(date: Date): MonthKey {
    return formatKey(date.getFullYear(), date.getMonth() + 1);
}

/** Parses a `YYYY-MM` string; anything else (including non-strings) returns null. */
export function parseMonthKey(value: unknown): { year: number; month: number } | null {
    if (typeof value !== "string") return null;
    const match = MONTH_KEY_PATTERN.exec(value);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]) };
}

function partsOf(key: MonthKey): { year: number; month: number } {
    const parts = parseMonthKey(key);
    if (!parts) throw new Error(`Invalid month key: ${key}`);
    return parts;
}

/** Absolute month number (`year * 12 + month - 1`), so subtracting two gives a month distance. */
export function monthIndex(key: MonthKey): number {
    const { year, month } = partsOf(key);
    return year * 12 + month - 1;
}

function keyFromIndex(index: number): MonthKey {
    const year = Math.floor(index / 12);
    return formatKey(year, index - year * 12 + 1);
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
    return keyFromIndex(monthIndex(key) + delta);
}

/** Number of months in the range, both ends inclusive. */
export function monthCount(range: MonthRange): number {
    return monthIndex(range.to) - monthIndex(range.from) + 1;
}

/** A range from two months in either order. */
export function rangeFromEnds(a: MonthKey, b: MonthKey): MonthRange {
    return a <= b ? { kind: "range", from: a, to: b } : { kind: "range", from: b, to: a };
}

/** The single-month range for the month containing `now`. */
export function currentMonthSelection(now: Date): MonthRange {
    const key = monthKeyOf(now);
    return { kind: "range", from: key, to: key };
}

/** The concrete selection a preset stands for, relative to `now`. */
export function presetSelection(id: PeriodPresetId, now: Date): PeriodSelection {
    const current = monthKeyOf(now);
    const year = now.getFullYear();
    switch (id) {
        case "this-month":
            return { kind: "range", from: current, to: current };
        case "last-month": {
            const previous = addMonths(current, -1);
            return { kind: "range", from: previous, to: previous };
        }
        case "last-3-months":
            return { kind: "range", from: addMonths(current, -2), to: current };
        case "last-12-months":
            return { kind: "range", from: addMonths(current, -11), to: current };
        case "year-to-date":
            return { kind: "range", from: formatKey(year, 1), to: current };
        case "last-year":
            return { kind: "range", from: formatKey(year - 1, 1), to: formatKey(year - 1, 12) };
        case "all-time":
            return { kind: "all" };
    }
}

function selectionsEqual(a: PeriodSelection, b: PeriodSelection): boolean {
    if (a.kind === "all" || b.kind === "all") return a.kind === b.kind;
    return a.from === b.from && a.to === b.to;
}

/**
 * The first preset (in list order) whose selection equals `selection`, or null.
 * List order decides ties: in January, `this-month` wins over `year-to-date`.
 */
export function matchPreset(
    selection: PeriodSelection,
    presets: readonly PeriodPresetId[],
    now: Date,
): PeriodPresetId | null {
    return presets.find((id) => selectionsEqual(presetSelection(id, now), selection)) ?? null;
}

/** A multi-month range that starts in January and spans at most a year. */
export function isYearAligned(range: MonthRange): boolean {
    const count = monthCount(range);
    return partsOf(range.from).month === 1 && count > 1 && count <= 12;
}

/** Shifts the range one step: a year for year-aligned ranges, otherwise its own length. */
export function stepRange(range: MonthRange, dir: -1 | 1): MonthRange {
    const step = isYearAligned(range) ? 12 : monthCount(range);
    return {
        kind: "range",
        from: addMonths(range.from, dir * step),
        to: addMonths(range.to, dir * step),
    };
}

/** Whether stepping forward would not go past the month containing `now`. */
export function canStepNext(range: MonthRange, now: Date): boolean {
    return monthIndex(stepRange(range, 1).to) <= monthIndex(monthKeyOf(now));
}

/** Whether the selection is exactly the month containing `now`. */
export function isCurrentMonthSelection(selection: PeriodSelection, now: Date): boolean {
    const current = monthKeyOf(now);
    return selection.kind === "range" && selection.from === current && selection.to === current;
}

/**
 * Human label for a selection: "Oct 2026", "Jul – Sep 2026", "Nov 2025 – Oct 2026",
 * "YTD 2026" (year-to-date with more than one month), or "All time".
 * `shortYear` switches years to the "’26" form.
 */
export function selectionLabel(selection: PeriodSelection, now: Date, opts: { shortYear: boolean }): string {
    if (selection.kind === "all") return "All time";

    const fromParts = partsOf(selection.from);
    const toParts = partsOf(selection.to);
    const yearText = (year: number) => (opts.shortYear ? `${APOSTROPHE}${String(year).slice(-2)}` : String(year));
    const monthName = (parts: { year: number; month: number }) =>
        new Date(parts.year, parts.month - 1, 1).toLocaleString("en-US", { month: "short" });

    if (monthCount(selection) > 1 && matchPreset(selection, ["year-to-date"], now)) {
        return `YTD ${yearText(fromParts.year)}`;
    }
    if (monthCount(selection) === 1) {
        return `${monthName(fromParts)} ${yearText(fromParts.year)}`;
    }
    if (fromParts.year === toParts.year) {
        return `${monthName(fromParts)} ${EN_DASH} ${monthName(toParts)} ${yearText(fromParts.year)}`;
    }
    return `${monthName(fromParts)} ${yearText(fromParts.year)} ${EN_DASH} ${monthName(toParts)} ${yearText(toParts.year)}`;
}

/**
 * Validates URL query values into a selection. Returns null when the query is absent or
 * invalid, meaning "use the default". `from=all` is only accepted when `allowAll` is set.
 */
export function parseSelectionQuery(
    query: { from?: unknown; to?: unknown },
    opts: { allowAll: boolean; now: Date },
): PeriodSelection | null {
    if (query.from === "all") return opts.allowAll ? { kind: "all" } : null;

    const from = parseMonthKey(query.from);
    const to = parseMonthKey(query.to);
    if (!from || !to) return null;

    const fromKey = formatKey(from.year, from.month);
    const toKey = formatKey(to.year, to.month);
    if (toKey < fromKey || toKey > monthKeyOf(opts.now)) return null;

    return { kind: "range", from: fromKey, to: toKey };
}

/** The URL query form of a selection: `{ from: "all" }` or `{ from, to }`. */
export function selectionToQuery(selection: PeriodSelection): { from: string; to?: string } {
    return selection.kind === "all" ? { from: "all" } : { from: selection.from, to: selection.to };
}

/** Inclusive `YYYY-MM-DD` bounds for a selection; `{}` for all time. */
export function selectionToDateBounds(selection: PeriodSelection): { startDate?: string; endDate?: string } {
    if (selection.kind === "all") return {};

    const { year, month } = partsOf(selection.to);
    return {
        startDate: `${selection.from}-01`,
        endDate: `${selection.to}-${pad2(lastDayOfMonth(year, month))}`,
    };
}

/** The reports comparison for a range: year-over-year for year-aligned ranges, otherwise the preceding period. */
export function compareModeFor(range: MonthRange): ReportCompareMode {
    return isYearAligned(range) ? "yearOverYear" : "previous";
}

/**
 * Query params for the spending report. A range ending this month stops at today, not at
 * month end, so the report never counts future days.
 */
export function toReportParams(
    range: MonthRange,
    now: Date,
): { startDate: string; endDate: string; compare: ReportCompareMode } {
    const { year, month } = partsOf(range.to);
    return {
        startDate: `${range.from}-01`,
        endDate:
            range.to === monthKeyOf(now) ? toLocalIsoDate(now) : `${range.to}-${pad2(lastDayOfMonth(year, month))}`,
        compare: compareModeFor(range),
    };
}

/** The comparison caption for a range, e.g. "vs same days last month" for a partial current month. */
export function comparisonLabel(range: MonthRange, now: Date): string {
    if (compareModeFor(range) === "yearOverYear") return "vs same period last year";

    const n = monthCount(range);
    if (range.to === monthKeyOf(now)) {
        return n === 1 ? "vs same days last month" : `vs same days of the previous ${n} months`;
    }
    return n === 1 ? "vs previous month" : `vs previous ${n} months`;
}

export interface GridEmitResult {
    /** The month a second click would extend from, or null when no range is being picked. */
    pendingStart: MonthKey | null;
    /** The selection to apply now, or null to leave it alone. */
    commit: MonthRange | null;
    /** Whether the picker should close (a range is complete). */
    close: boolean;
}

/**
 * Interprets one emit of PrimeVue's range month grid. PrimeVue emits `[start, end]`, and
 * on a click before the pending start it emits `[clicked, null]` (resetting the start).
 *
 * The model: a first click selects that month and becomes the pending start, and the
 * picker stays open. A second click completes the range in either order, and closes it.
 * Clicking the pending month again completes a single-month range. Only a completed range
 * closes the picker.
 */
export function applyGridEmit(
    pendingStart: MonthKey | null,
    emitted: readonly [MonthKey | null, MonthKey | null] | null,
): GridEmitResult {
    if (emitted === null) return { pendingStart: null, commit: null, close: false };

    const [first, second] = emitted;
    if (second !== null) {
        return {
            pendingStart: null,
            commit: rangeFromEnds(first ?? pendingStart ?? second, second),
            close: true,
        };
    }
    if (first === null) return { pendingStart: null, commit: null, close: false };
    if (pendingStart !== null) {
        return { pendingStart: null, commit: rangeFromEnds(first, pendingStart), close: true };
    }
    return { pendingStart: first, commit: rangeFromEnds(first, first), close: false };
}

/** Label for a `YYYY-MM` key, e.g. `Oct 2026`. */
export function monthKeyLabel(key: MonthKey): string {
    const { year, month } = partsOf(key);
    const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short" });
    return `${monthName} ${year}`;
}

/**
 * The hint under the month grid, shared by SharedPeriodPanel's grid and SharedMonthStrip so
 * both read the same. Idle says how to start; pending names the month picked so far.
 */
export function monthPickHint(pendingStart: MonthKey | null, opts: { touch: boolean }): string {
    const verb = opts.touch ? "tap" : "pick";
    if (pendingStart === null) {
        return opts.touch ? "Tap a month, or two for a range" : "Pick a month, or two for a range";
    }
    return `${monthKeyLabel(pendingStart)} selected · ${verb} another month to make a range`;
}

export type MonthBandRole = "none" | "single" | "pending" | "start" | "end" | "middle";

export interface MonthBandCell {
    role: MonthBandRole;
    /** Whether the cell's left side is a row edge where the band continues into it, so it gets the small cap. */
    capLeft: boolean;
    /** Whether the cell's right side is a row edge where the band continues into it, so it gets the small cap. */
    capRight: boolean;
}

function bandRole(cell: MonthKey, band: MonthRange | null, pendingStart: MonthKey | null): MonthBandRole {
    if (pendingStart !== null) return cell === pendingStart ? "pending" : "none";
    if (band === null || cell < band.from || cell > band.to) return "none";
    if (band.from === cell && band.to === cell) return "single";
    if (cell === band.from) return "start";
    if (cell === band.to) return "end";
    return "middle";
}

/**
 * Where one month cell of the 3-column month grid sits in the shown range. `monthOfYear` is 0-based (PrimeVue's
 * `context.monthIndex`). A range edge in a year the grid is not showing never equals a visible cell, so its
 * visible neighbour month reads as a middle.
 */
export function monthBandCell(
    year: number,
    monthOfYear: number,
    band: MonthRange | null,
    pendingStart: MonthKey | null,
): MonthBandCell {
    const role = bandRole(formatKey(year, monthOfYear + 1), band, pendingStart);
    const column = monthOfYear % 3;
    return {
        role,
        capLeft: column === 0 && (role === "middle" || role === "end"),
        capRight: column === 2 && (role === "middle" || role === "start"),
    };
}
