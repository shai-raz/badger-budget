import { describe, expect, it } from "vitest";
import { UNMATCHED_IMPORT_CATEGORY_MODES } from "@badger/shared-data";

import { UNMATCHED_IMPORT_CATEGORY_OPTIONS, UNMATCHED_IMPORT_CATEGORY_ORDER } from "./unmatchedImportCategory";

describe("UNMATCHED_IMPORT_CATEGORY_OPTIONS", () => {
    it.each(UNMATCHED_IMPORT_CATEGORY_MODES)("gives the %s mode a non-empty label and hint", (mode) => {
        const option = UNMATCHED_IMPORT_CATEGORY_OPTIONS[mode];
        expect(option.label.trim()).not.toBe("");
        expect(option.hint.trim()).not.toBe("");
    });

    it("uses the spec copy for each mode", () => {
        expect(UNMATCHED_IMPORT_CATEGORY_OPTIONS.create_or_reuse).toEqual({
            label: "Bank's category",
            hint: "Use the category your bank reports, creating it if you don't have one yet.",
        });
        expect(UNMATCHED_IMPORT_CATEGORY_OPTIONS.reuse_only).toEqual({
            label: "Bank's category, if it exists",
            hint: "Use the bank's category only when you already have one with that name. Otherwise leave it uncategorized.",
        });
        expect(UNMATCHED_IMPORT_CATEGORY_OPTIONS.uncategorized).toEqual({
            label: "Uncategorized",
            hint: "Leave it for you to categorize.",
        });
    });
});

describe("UNMATCHED_IMPORT_CATEGORY_ORDER", () => {
    it("lists every shared mode once, in the shared order", () => {
        expect(UNMATCHED_IMPORT_CATEGORY_ORDER).toEqual([...UNMATCHED_IMPORT_CATEGORY_MODES]);
    });
});
