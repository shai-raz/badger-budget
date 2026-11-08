import { UNMATCHED_IMPORT_CATEGORY_MODES, type UnmatchedImportCategoryMode } from "@badger/shared-data";

export interface UnmatchedImportCategoryOption {
    label: string;
    hint: string;
}

// Copy for the "When no rule matches" setting. Keyed by the shared modes, so a new mode fails the type check until it has copy.
export const UNMATCHED_IMPORT_CATEGORY_OPTIONS: Record<UnmatchedImportCategoryMode, UnmatchedImportCategoryOption> = {
    create_or_reuse: {
        label: "Bank's category",
        hint: "Use the category your bank reports, creating it if you don't have one yet.",
    },
    reuse_only: {
        label: "Bank's category, if it exists",
        hint: "Use the bank's category only when you already have one with that name. Otherwise leave it uncategorized.",
    },
    uncategorized: {
        label: "Uncategorized",
        hint: "Leave it for you to categorize.",
    },
};

/** The modes in the order the dialog lists them. */
export const UNMATCHED_IMPORT_CATEGORY_ORDER: readonly UnmatchedImportCategoryMode[] = UNMATCHED_IMPORT_CATEGORY_MODES;
