export type HeaderLeading = "back" | "menu" | "none";

/**
 * Child pages (with a parent route) show back at every breakpoint; top-level pages show the
 * hamburger below md and nothing on desktop, where the sidebar is always visible.
 */
export function resolveHeaderLeading(opts: { hasParent: boolean; isDesktop: boolean }): HeaderLeading {
    if (opts.hasParent) return "back";
    return opts.isDesktop ? "none" : "menu";
}
