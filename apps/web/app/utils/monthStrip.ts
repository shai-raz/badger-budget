/**
 * Pure geometry, selection and paging for the Reports monthly spending strip. The strip shows
 * a sliding window of months; everything here works on `YYYY-MM` keys, so the component only
 * converts pointer pixels to months and wires DOM events. Anything that depends on "now" takes
 * `now: Date` as a parameter so it stays testable.
 */
import type { MonthlySpending } from "@badger/types";
import {
    addMonths,
    monthCount,
    monthIndex,
    monthKeyOf,
    rangeFromEnds,
    type MonthKey,
    type MonthRange,
} from "./monthRange";

/** Months visible at once, per layout. */
export const STRIP_VISIBLE = { desktop: 24, mobile: 12 } as const;
/** How far the side arrows slide the window. */
export const STRIP_SLIDE_STEP = 6;
/** Delay between edge auto-scroll ticks while a drag sits at the strip's edge. */
export const STRIP_EDGE_SCROLL_MS = { desktop: 140, mobile: 160 } as const;
/** Months per monthly-spending page query. */
export const STRIP_PAGE_SIZE = 24;

export interface StripBounds {
    /** Oldest month the window may start at. */
    lowestStart: MonthKey;
    /** Newest month the window may start at: the window's last month is the current month. */
    highestStart: MonthKey;
}

/**
 * The window start bounds. The newest window always ends at the current month. The oldest
 * one reaches back to the first month with spending, or stays at the newest start when there
 * is no earlier history.
 */
export function stripBounds(firstMonth: MonthKey | null, now: Date, visibleCount: number): StripBounds {
    const highestStart = addMonths(monthKeyOf(now), -(visibleCount - 1));
    const lowestStart = firstMonth && firstMonth < highestStart ? firstMonth : highestStart;
    return { lowestStart, highestStart };
}

export function clampWindowStart(start: MonthKey, bounds: StripBounds): MonthKey {
    if (start < bounds.lowestStart) return bounds.lowestStart;
    if (start > bounds.highestStart) return bounds.highestStart;
    return start;
}

export function slideWindow(start: MonthKey, delta: number, bounds: StripBounds): MonthKey {
    return clampWindowStart(addMonths(start, delta), bounds);
}

/**
 * The window start that shows `range`. A window that already contains the range is unchanged.
 * A range that fits moves the window by the least amount. A range longer than the window
 * aligns the window's end to the range's last month. The result is clamped to the bounds.
 */
export function windowToShow(start: MonthKey, range: MonthRange, visibleCount: number, bounds: StripBounds): MonthKey {
    const windowEnd = addMonths(start, visibleCount - 1);
    if (range.from >= start && range.to <= windowEnd) return start;

    const endAligned = addMonths(range.to, -(visibleCount - 1));
    const fits = monthCount(range) <= visibleCount;
    const next = fits && range.from < start ? range.from : endAligned;
    return clampWindowStart(next, bounds);
}

/** Every month the track renders: from the lowest start through the last month of the highest window. */
export function stripMonths(bounds: StripBounds, visibleCount: number): MonthKey[] {
    const count = monthIndex(bounds.highestStart) + visibleCount - monthIndex(bounds.lowestStart);
    const months: MonthKey[] = [];
    for (let i = 0; i < count; i++) months.push(addMonths(bounds.lowestStart, i));
    return months;
}

/** The month under horizontal offset `x` in a strip `width` px wide, showing `visibleCount` months from `windowStart`. */
export function monthAtOffset(x: number, width: number, windowStart: MonthKey, visibleCount: number): MonthKey {
    const raw = width > 0 ? Math.floor((x / width) * visibleCount) : 0;
    return addMonths(windowStart, Math.min(visibleCount - 1, Math.max(0, raw)));
}

/** -1 when `x` is within `edgePx` of the left edge, 1 within `edgePx` of the right edge, else 0. */
export function edgeDirection(x: number, width: number, edgePx: number): -1 | 0 | 1 {
    if (x < edgePx) return -1;
    if (x > width - edgePx) return 1;
    return 0;
}

/**
 * Decides whether a touch or pointer gesture is a horizontal drag (select months), a vertical
 * scroll (leave it to the page), or still too small to tell.
 */
export function classifyGesture(dx: number, dy: number, threshold = 8): "undecided" | "horizontal" | "vertical" {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < threshold) return "undecided";
    return absX > absY ? "horizontal" : "vertical";
}

export type StripInteraction =
    | { kind: "idle" }
    | { kind: "pending"; start: MonthKey }
    | { kind: "dragging"; anchor: MonthKey; current: MonthKey };

/**
 * Tap-tap selection. A tap with no pending start sets one. A tap with a pending start commits
 * the range between the two months, in either order, including a single month tapped twice.
 */
export function tapMonth(
    interaction: StripInteraction,
    month: MonthKey,
): { interaction: StripInteraction; commit: MonthRange | null } {
    if (interaction.kind === "pending") {
        return { interaction: { kind: "idle" }, commit: rangeFromEnds(interaction.start, month) };
    }
    return { interaction: { kind: "pending", start: month }, commit: null };
}

/** The range to highlight while selecting: from a pending start to the hovered month, or the drag span. */
export function previewRange(interaction: StripInteraction, hovered: MonthKey | null): MonthRange | null {
    if (interaction.kind === "pending") {
        return hovered === null ? null : rangeFromEnds(interaction.start, hovered);
    }
    if (interaction.kind === "dragging") return rangeFromEnds(interaction.anchor, interaction.current);
    return null;
}

/**
 * Mean of the loaded monthly totals for months from `firstMonth` onward. Months with no loaded
 * total are skipped. Returns null when there is no first month (no counted spending) or no
 * loaded month to average.
 */
export function stripAverage(
    totals: Record<MonthKey, number>,
    months: MonthKey[],
    firstMonth: MonthKey | null,
): number | null {
    if (firstMonth === null) return null;

    let sum = 0;
    let count = 0;
    for (const month of months) {
        if (month < firstMonth) continue;
        const total: number | undefined = totals[month];
        if (total === undefined) continue;
        sum += total;
        count++;
    }
    return count === 0 ? null : sum / count;
}

/**
 * Bar height as a percentage of the tallest bar. A non-zero total is at least 2% so it stays
 * visible. A zero total, or a zero max, gives 0.
 */
export function barHeightPercent(total: number, max: number): number {
    if (max <= 0 || total <= 0) return 0;
    return Math.min(100, Math.max(2, (total / max) * 100));
}

/** Axis label for a month: the short English month name, plus the year for January only. */
export function stripMonthLabel(month: MonthKey): { month: string; year: string | null } {
    const index = monthIndex(month);
    const year = Math.floor(index / 12);
    const monthNumber = index - year * 12;
    const name = new Date(year, monthNumber, 1).toLocaleString("en-US", { month: "short" });
    return { month: name, year: monthNumber === 0 ? String(year) : null };
}

/** The hint line under the strip: a plain meta line, or a highlighted tag while a start month is pending. */
export function stripHint(
    interaction: StripInteraction,
    opts: { mobile: boolean; dragLabel: string | null },
): { kind: "meta" | "tag"; text: string } {
    const idleText = opts.mobile ? "Tap or drag to select months" : "Click or drag to select months";
    if (interaction.kind === "pending") {
        return { kind: "tag", text: opts.mobile ? "Tap end month" : "Select end month" };
    }
    if (interaction.kind === "dragging") {
        return { kind: "meta", text: opts.dragLabel ?? idleText };
    }
    return { kind: "meta", text: idleText };
}

/** Months covered by a page. Page 0 ends at the current month, and each later page is one page size older. */
export function stripPageRange(pageIndex: number, now: Date): { startMonth: MonthKey; endMonth: MonthKey } {
    const endMonth = addMonths(monthKeyOf(now), -pageIndex * STRIP_PAGE_SIZE);
    return { startMonth: addMonths(endMonth, -(STRIP_PAGE_SIZE - 1)), endMonth };
}

function pageOfMonth(month: MonthKey, now: Date): number {
    const distance = monthIndex(monthKeyOf(now)) - monthIndex(month);
    return Math.floor(distance / STRIP_PAGE_SIZE);
}

/**
 * The ascending page indexes that cover the window plus a slide-step buffer on its older side,
 * so a slide can render without waiting. Pages that would lie in the future are dropped.
 */
export function pagesForWindow(windowStart: MonthKey, visibleCount: number, now: Date): number[] {
    const newestPage = Math.max(0, pageOfMonth(addMonths(windowStart, visibleCount - 1), now));
    const oldestPage = pageOfMonth(addMonths(windowStart, -STRIP_SLIDE_STEP), now);

    const pages: number[] = [];
    for (let page = newestPage; page <= oldestPage; page++) pages.push(page);
    return pages;
}

/**
 * Combines loaded monthly pages into one totals map and the earliest known first month. Missing
 * (undefined) pages are skipped.
 */
export function mergeMonthlyPages(pages: (MonthlySpending | undefined)[]): {
    totals: Record<MonthKey, number>;
    firstMonth: MonthKey | null;
} {
    const totals: Record<MonthKey, number> = {};
    let firstMonth: MonthKey | null = null;

    for (const page of pages) {
        if (!page) continue;
        for (const point of page.months) totals[point.month] = point.total;
        if (page.firstMonth && (firstMonth === null || page.firstMonth < firstMonth)) {
            firstMonth = page.firstMonth;
        }
    }
    return { totals, firstMonth };
}
