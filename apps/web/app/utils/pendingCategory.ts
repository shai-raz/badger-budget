export interface PendingCategory {
    name: string;
    color: string;
}

/** Tailwind 500 shades: distinct, readable on light and dark surfaces. */
export const NEW_CATEGORY_PALETTE: readonly string[] = [
    "#EF4444",
    "#F97316",
    "#F59E0B",
    "#84CC16",
    "#22C55E",
    "#10B981",
    "#14B8A6",
    "#06B6D4",
    "#0EA5E9",
    "#3B82F6",
    "#6366F1",
    "#8B5CF6",
    "#A855F7",
    "#D946EF",
    "#EC4899",
    "#F43F5E",
];
export const NEW_CATEGORY_OPTION_ID = "__new_category__";

/** Trimmed name to offer as "+ Create", or null when empty or an exact case-insensitive match exists. */
export function createOptionName(
    filterText: string | null | undefined,
    existingNames: readonly string[],
): string | null {
    const trimmed = (filterText ?? "").trim();
    if (!trimmed) return null;
    const key = trimmed.toLocaleLowerCase();
    if (existingNames.some((n) => n.trim().toLocaleLowerCase() === key)) return null;
    return trimmed;
}

/** Random palette colour, preferring ones no existing category uses (case-insensitive); any palette colour when all are used. */
export function pickNewCategoryColor(
    usedColors: readonly (string | null | undefined)[],
    random: () => number = Math.random,
): string {
    const used = new Set(usedColors.map((c) => (c ?? "").trim().toUpperCase()).filter(Boolean));
    const free = NEW_CATEGORY_PALETTE.filter((c) => !used.has(c));
    const pool = free.length ? free : NEW_CATEGORY_PALETTE;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}

/**
 * Creates the pending category (if any), hands the real id to the form before saving so a failed
 * save can be retried without creating a duplicate, then runs `save`.
 */
export async function saveWithPendingCategory<T>(args: {
    pending: PendingCategory | null;
    createCategory: (data: PendingCategory) => Promise<{ id: string }>;
    onCategoryCreated: (id: string) => void;
    save: (createdCategoryId: string | null) => Promise<T>;
}): Promise<T> {
    const { pending, createCategory, onCategoryCreated, save } = args;
    if (!pending) return save(null);
    const { id } = await createCategory({ name: pending.name.trim(), color: pending.color });
    onCategoryCreated(id);
    return save(id);
}
