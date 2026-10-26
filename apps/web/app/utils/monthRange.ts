/**
 * Pure month-range logic for the shared period picker. Every date is built from
 * local parts (never `toISOString()`), and anything that depends on "now" takes
 * `now: Date` as a parameter so it stays testable.
 */

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

/**
 * Interprets one emit of PrimeVue's range month grid. PrimeVue emits `[start, end]`, and
 * on a click before the pending start it emits `[clicked, null]` (resetting the start).
 * Treating that as "range from clicked to pending" keeps the grid order-independent.
 */
export function applyGridEmit(
    pendingStart: MonthKey | null,
    emitted: readonly [MonthKey | null, MonthKey | null] | null,
): { pendingStart: MonthKey | null; commit: MonthRange | null } {
    if (emitted === null) return { pendingStart: null, commit: null };

    const [first, second] = emitted;
    if (second !== null) {
        return { pendingStart: null, commit: rangeFromEnds(first ?? pendingStart ?? second, second) };
    }
    if (first === null) return { pendingStart: null, commit: null };
    if (pendingStart !== null && first < pendingStart) {
        return { pendingStart: null, commit: rangeFromEnds(first, pendingStart) };
    }
    return { pendingStart: first, commit: null };
}
