import { resolveCategoryId } from "./category-resolution";
import { SyncResultDto } from "./dto";

// The resolver only reads and bumps categoriesCreated, so the rest of the sync result is left unset.
function makeSyncResult(): SyncResultDto {
    return { categoriesCreated: 0 } as SyncResultDto;
}

describe("resolveCategoryId", () => {
    it("prioritizes mapping rule over existing category with same name", async () => {
        const matchCategoryByRules = jest.fn().mockReturnValue("mapped-category-id");
        const createCategory = jest.fn();

        const result = await resolveCategoryId({
            categoryName: "Groceries",
            categoryByName: new Map([["Groceries", "existing-category-id"]]),
            createdCategoryNames: new Set<string>(),
            result: makeSyncResult(),
            matchCategoryByRules,
            createCategory,
            mode: "create_or_reuse",
        });

        expect(result).toBe("mapped-category-id");
        expect(createCategory).not.toHaveBeenCalled();
        expect(matchCategoryByRules).toHaveBeenCalledTimes(1);
    });

    it("returns the rule match when the row has no category name", async () => {
        const createCategory = jest.fn();

        const result = await resolveCategoryId({
            categoryName: "",
            categoryByName: new Map(),
            createdCategoryNames: new Set<string>(),
            result: makeSyncResult(),
            matchCategoryByRules: jest.fn().mockReturnValue("rule-category-id"),
            createCategory,
            mode: "create_or_reuse",
        });

        expect(result).toBe("rule-category-id");
        expect(createCategory).not.toHaveBeenCalled();
    });

    it("returns null when the row has no category name and no rule matches", async () => {
        const createCategory = jest.fn();

        const result = await resolveCategoryId({
            categoryName: "",
            categoryByName: new Map(),
            createdCategoryNames: new Set<string>(),
            result: makeSyncResult(),
            matchCategoryByRules: jest.fn().mockReturnValue(null),
            createCategory,
            mode: "create_or_reuse",
        });

        expect(result).toBeNull();
        expect(createCategory).not.toHaveBeenCalled();
    });

    it("falls back to existing category when no mapping rule matches", async () => {
        const createCategory = jest.fn();

        const result = await resolveCategoryId({
            categoryName: "Fuel",
            categoryByName: new Map([["Fuel", "fuel-category-id"]]),
            createdCategoryNames: new Set<string>(),
            result: makeSyncResult(),
            matchCategoryByRules: jest.fn().mockReturnValue(null),
            createCategory,
            mode: "create_or_reuse",
        });

        expect(result).toBe("fuel-category-id");
        expect(createCategory).not.toHaveBeenCalled();
    });

    it("creates a new category when no rule matches and no existing category exists", async () => {
        const categoryByName = new Map<string, string>();
        const createdCategoryNames = new Set<string>();
        const syncResult = makeSyncResult();

        const result = await resolveCategoryId({
            categoryName: "Unexpected Vendor",
            categoryByName,
            createdCategoryNames,
            result: syncResult,
            matchCategoryByRules: jest.fn().mockReturnValue(null),
            createCategory: jest.fn().mockResolvedValue({ id: "new-category-id" }),
            mode: "create_or_reuse",
        });

        expect(result).toBe("new-category-id");
        expect(categoryByName.get("Unexpected Vendor")).toBe("new-category-id");
        expect(createdCategoryNames.has("Unexpected Vendor")).toBe(true);
        expect(syncResult.categoriesCreated).toBe(1);
    });

    describe("unmatchedImportCategory mode", () => {
        it("create_or_reuse reuses an existing category without creating one", async () => {
            const createCategory = jest.fn();
            const syncResult = makeSyncResult();

            const result = await resolveCategoryId({
                categoryName: "Fuel",
                categoryByName: new Map([["Fuel", "fuel-category-id"]]),
                createdCategoryNames: new Set<string>(),
                result: syncResult,
                matchCategoryByRules: jest.fn().mockReturnValue(null),
                createCategory,
                mode: "create_or_reuse",
            });

            expect(result).toBe("fuel-category-id");
            expect(createCategory).not.toHaveBeenCalled();
            expect(syncResult.categoriesCreated).toBe(0);
        });

        it("create_or_reuse creates a missing category and counts it", async () => {
            const categoryByName = new Map<string, string>();
            const syncResult = makeSyncResult();
            const createCategory = jest.fn().mockResolvedValue({ id: "new-category-id" });

            const result = await resolveCategoryId({
                categoryName: "Unexpected Vendor",
                categoryByName,
                createdCategoryNames: new Set<string>(),
                result: syncResult,
                matchCategoryByRules: jest.fn().mockReturnValue(null),
                createCategory,
                mode: "create_or_reuse",
            });

            expect(result).toBe("new-category-id");
            expect(createCategory).toHaveBeenCalledTimes(1);
            expect(categoryByName.get("Unexpected Vendor")).toBe("new-category-id");
            expect(syncResult.categoriesCreated).toBe(1);
        });

        it("reuse_only reuses an existing category, including a system category id", async () => {
            const createCategory = jest.fn();
            const syncResult = makeSyncResult();

            const result = await resolveCategoryId({
                categoryName: "Transfers",
                categoryByName: new Map([["Transfers", "system-category-id"]]),
                createdCategoryNames: new Set<string>(),
                result: syncResult,
                matchCategoryByRules: jest.fn().mockReturnValue(null),
                createCategory,
                mode: "reuse_only",
            });

            expect(result).toBe("system-category-id");
            expect(createCategory).not.toHaveBeenCalled();
            expect(syncResult.categoriesCreated).toBe(0);
        });

        it("reuse_only returns null for a missing category without creating one", async () => {
            const categoryByName = new Map<string, string>();
            const createdCategoryNames = new Set<string>();
            const syncResult = makeSyncResult();
            const createCategory = jest.fn();

            const result = await resolveCategoryId({
                categoryName: "Unexpected Vendor",
                categoryByName,
                createdCategoryNames,
                result: syncResult,
                matchCategoryByRules: jest.fn().mockReturnValue(null),
                createCategory,
                mode: "reuse_only",
            });

            expect(result).toBeNull();
            expect(createCategory).not.toHaveBeenCalled();
            expect(categoryByName.has("Unexpected Vendor")).toBe(false);
            expect(createdCategoryNames.has("Unexpected Vendor")).toBe(false);
            expect(syncResult.categoriesCreated).toBe(0);
        });

        it("uncategorized returns null for an existing category without creating one", async () => {
            const createCategory = jest.fn();
            const syncResult = makeSyncResult();

            const result = await resolveCategoryId({
                categoryName: "Fuel",
                categoryByName: new Map([["Fuel", "fuel-category-id"]]),
                createdCategoryNames: new Set<string>(),
                result: syncResult,
                matchCategoryByRules: jest.fn().mockReturnValue(null),
                createCategory,
                mode: "uncategorized",
            });

            expect(result).toBeNull();
            expect(createCategory).not.toHaveBeenCalled();
            expect(syncResult.categoriesCreated).toBe(0);
        });

        it.each(["create_or_reuse", "reuse_only", "uncategorized"] as const)(
            "rule match wins over the category name in %s mode",
            async (mode) => {
                const createCategory = jest.fn();
                const matchCategoryByRules = jest.fn().mockReturnValue("rule-category-id");

                const result = await resolveCategoryId({
                    categoryName: "Fuel",
                    categoryByName: new Map([["Fuel", "fuel-category-id"]]),
                    createdCategoryNames: new Set<string>(),
                    result: makeSyncResult(),
                    matchCategoryByRules,
                    createCategory,
                    mode,
                });

                expect(result).toBe("rule-category-id");
                expect(createCategory).not.toHaveBeenCalled();
            },
        );

        it.each(["create_or_reuse", "reuse_only", "uncategorized"] as const)(
            "returns null for a blank category name in %s mode",
            async (mode) => {
                const createCategory = jest.fn();

                const result = await resolveCategoryId({
                    categoryName: "",
                    categoryByName: new Map([["", "blank-category-id"]]),
                    createdCategoryNames: new Set<string>(),
                    result: makeSyncResult(),
                    matchCategoryByRules: jest.fn().mockReturnValue(null),
                    createCategory,
                    mode,
                });

                expect(result).toBeNull();
                expect(createCategory).not.toHaveBeenCalled();
            },
        );
    });
});
