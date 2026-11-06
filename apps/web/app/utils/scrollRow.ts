/**
 * Geometry and input mapping for `SharedScrollRow`, a sideways-scrolling row. The component reads the DOM;
 * these functions take plain numbers so they stay testable in node.
 */

/** Sub-pixel scroll positions can leave an edge a pixel short, so within this slack counts as at the edge. */
const EDGE_TOLERANCE_PX = 1;

/** An arrow scrolls this share of the visible width. */
export const SCROLL_ROW_STEP_RATIO = 0.8;

export function scrollRowEdges(m: { scrollLeft: number; clientWidth: number; scrollWidth: number }): {
    canScrollStart: boolean;
    canScrollEnd: boolean;
} {
    const maxScrollLeft = m.scrollWidth - m.clientWidth;
    return {
        canScrollStart: m.scrollLeft > EDGE_TOLERANCE_PX,
        canScrollEnd: m.scrollLeft < maxScrollLeft - EDGE_TOLERANCE_PX,
    };
}

/**
 * A vertical wheel turn becomes a horizontal scroll by `deltaY`. A mostly horizontal turn (a trackpad swipe) is
 * left to the browser, so it returns null.
 */
export function wheelToHorizontal(deltaX: number, deltaY: number): number | null {
    return Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : null;
}
