/**
 * Display metadata for the synthetic bucket that groups transactions with no
 * category. Not a real Category row — every surface that renders it (API
 * reports, web components) must agree on this name/color.
 */
export const UNCATEGORIZED_CATEGORY = {
    name: "Uncategorized",
    color: "#9ca3af",
} as const;
