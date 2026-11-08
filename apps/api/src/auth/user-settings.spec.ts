import { DEFAULT_UNMATCHED_IMPORT_CATEGORY, UNMATCHED_IMPORT_CATEGORY_MODES } from "@badger/shared-data";
import { loadUserSettings, parseUserSettings } from "./user-settings";

describe("parseUserSettings", () => {
    it("returns the defaults for an empty object", () => {
        expect(parseUserSettings({})).toEqual({ unmatchedImportCategory: DEFAULT_UNMATCHED_IMPORT_CATEGORY });
    });

    it.each(UNMATCHED_IMPORT_CATEGORY_MODES)("round-trips the valid mode %s", (mode) => {
        expect(parseUserSettings({ unmatchedImportCategory: mode })).toEqual({ unmatchedImportCategory: mode });
    });

    it("falls back to the default for an invalid mode", () => {
        expect(parseUserSettings({ unmatchedImportCategory: "delete_everything" })).toEqual({
            unmatchedImportCategory: DEFAULT_UNMATCHED_IMPORT_CATEGORY,
        });
        expect(parseUserSettings({ unmatchedImportCategory: 42 })).toEqual({
            unmatchedImportCategory: DEFAULT_UNMATCHED_IMPORT_CATEGORY,
        });
    });

    it("drops unknown keys", () => {
        const parsed = parseUserSettings({ unmatchedImportCategory: "reuse_only", theme: "dark" });
        expect(parsed).toEqual({ unmatchedImportCategory: "reuse_only" });
    });

    it.each([
        ["null", null],
        ["an array", ["reuse_only"]],
        ["a string", "reuse_only"],
        ["a number", 7],
        ["undefined", undefined],
    ])("returns the defaults for %s", (_label, raw) => {
        expect(parseUserSettings(raw)).toEqual({ unmatchedImportCategory: DEFAULT_UNMATCHED_IMPORT_CATEGORY });
    });
});

describe("loadUserSettings", () => {
    it("selects only settings for the user and resolves them", async () => {
        const findUnique = jest.fn().mockResolvedValue({ settings: { unmatchedImportCategory: "uncategorized" } });
        const db = { user: { findUnique } } as unknown as Parameters<typeof loadUserSettings>[0];

        await expect(loadUserSettings(db, "user-1")).resolves.toEqual({ unmatchedImportCategory: "uncategorized" });
        expect(findUnique).toHaveBeenCalledTimes(1);
        expect(findUnique).toHaveBeenCalledWith({ where: { id: "user-1" }, select: { settings: true } });
    });

    it("returns the defaults when the user row is missing", async () => {
        const db = { user: { findUnique: jest.fn().mockResolvedValue(null) } } as unknown as Parameters<
            typeof loadUserSettings
        >[0];

        await expect(loadUserSettings(db, "missing")).resolves.toEqual({
            unmatchedImportCategory: DEFAULT_UNMATCHED_IMPORT_CATEGORY,
        });
    });
});
