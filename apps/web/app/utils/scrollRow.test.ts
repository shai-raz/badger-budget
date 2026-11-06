import { describe, expect, it } from "vitest";
import { SCROLL_ROW_STEP_RATIO, scrollRowEdges, wheelToHorizontal } from "./scrollRow";

describe("scrollRowEdges", () => {
    it("reports no scrolling when the content fits", () => {
        expect(scrollRowEdges({ scrollLeft: 0, clientWidth: 400, scrollWidth: 400 })).toEqual({
            canScrollStart: false,
            canScrollEnd: false,
        });
    });

    it("can only scroll toward the end at the start of an overflowing row", () => {
        expect(scrollRowEdges({ scrollLeft: 0, clientWidth: 400, scrollWidth: 900 })).toEqual({
            canScrollStart: false,
            canScrollEnd: true,
        });
    });

    it("can scroll both ways in the middle", () => {
        expect(scrollRowEdges({ scrollLeft: 200, clientWidth: 400, scrollWidth: 900 })).toEqual({
            canScrollStart: true,
            canScrollEnd: true,
        });
    });

    it("can only scroll back at the end", () => {
        expect(scrollRowEdges({ scrollLeft: 500, clientWidth: 400, scrollWidth: 900 })).toEqual({
            canScrollStart: true,
            canScrollEnd: false,
        });
    });

    it("treats a position within 1px of an edge as at that edge", () => {
        const nearStart = scrollRowEdges({ scrollLeft: 1, clientWidth: 400, scrollWidth: 900 });
        expect(nearStart.canScrollStart).toBe(false);
        const nearEnd = scrollRowEdges({ scrollLeft: 499, clientWidth: 400, scrollWidth: 900 });
        expect(nearEnd.canScrollEnd).toBe(false);
    });
});

describe("wheelToHorizontal", () => {
    it("maps a vertical wheel turn to a horizontal delta", () => {
        expect(wheelToHorizontal(0, 120)).toBe(120);
        expect(wheelToHorizontal(0, -40)).toBe(-40);
    });

    it("lets a mostly horizontal turn through to the browser", () => {
        expect(wheelToHorizontal(80, 20)).toBeNull();
    });

    it("returns null for no movement", () => {
        expect(wheelToHorizontal(0, 0)).toBeNull();
    });
});

describe("SCROLL_ROW_STEP_RATIO", () => {
    it("scrolls 80% of the visible width per arrow", () => {
        expect(SCROLL_ROW_STEP_RATIO).toBe(0.8);
    });
});
