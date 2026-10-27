export type HeaderLeading = "back" | "menu" | "none";

/**
 * Child pages (with a parent route) show back at every breakpoint; top-level pages show the
 * hamburger below md and nothing on desktop, where the sidebar is always visible.
 */
export function resolveHeaderLeading(opts: { hasParent: boolean; isDesktop: boolean }): HeaderLeading {
    if (opts.hasParent) return "back";
    return opts.isDesktop ? "none" : "menu";
}

/**
 * True when the browser's back entry is `backTo`, ignoring its query and hash. Vue Router stores
 * `history.state.back` as a full path, so `/transactions?from=2026-07` matches `/transactions`.
 */
export function canGoBackTo(historyBack: unknown, backTo: string): boolean {
    if (typeof historyBack !== "string" || historyBack === "") return false;
    const path = historyBack.split(/[?#]/, 1)[0];
    return path === backTo;
}
