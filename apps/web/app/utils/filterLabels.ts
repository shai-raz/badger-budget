/** The filter a label describes. Plural nouns, so counts read as "3 categories". */
export type FilterNoun = "categories" | "accounts" | "types";

/** Heading and "everything" wording for each filter, as the controls show it. */
export const FILTER_COPY: Record<FilterNoun, { title: string; allLabel: string }> = {
    categories: { title: "Categories", allLabel: "All categories" },
    accounts: { title: "Accounts", allLabel: "All accounts" },
    types: { title: "Type", allLabel: "All types" },
};

/**
 * Short summary of a filter's selection for a collapsed control. Null when nothing is selected (the "all" state). One
 * selection shows its label. Several types are joined with " + ", since the three types read naturally that way;
 * several categories or accounts are counted instead.
 */
export function filterSelectionLabel(noun: FilterNoun, selected: readonly { label: string }[]): string | null {
    const [only] = selected;
    if (!only) return null;
    if (selected.length === 1) return only.label;
    if (noun === "types") return selected.map((option) => option.label).join(" + ");
    return `${selected.length} ${noun}`;
}
