import { resolveCategoryId } from "./category-resolution";

describe("resolveCategoryId", () => {
    it("prioritizes mapping rule over existing category with same name", async () => {
        const matchCategoryByRules = jest.fn().mockResolvedValue("mapped-category-id");
        const createCategory = jest.fn();

        const result = await resolveCategoryId({
            categoryName: "Groceries",
            categoryByName: new Map([["Groceries", "existing-category-id"]]),
            createdCategoryNames: new Set<string>(),
            result: { categoriesCreated: 0 } as any,
            matchCategoryByRules,
            createCategory,
        });

        expect(result).toBe("mapped-category-id");
        expect(createCategory).not.toHaveBeenCalled();
        expect(matchCategoryByRules).toHaveBeenCalledTimes(1);
    });

    it("falls back to existing category when no mapping rule matches", async () => {
        const createCategory = jest.fn();

        const result = await resolveCategoryId({
            categoryName: "Fuel",
            categoryByName: new Map([["Fuel", "fuel-category-id"]]),
            createdCategoryNames: new Set<string>(),
            result: { categoriesCreated: 0 } as any,
            matchCategoryByRules: jest.fn().mockResolvedValue(null),
            createCategory,
        });

        expect(result).toBe("fuel-category-id");
        expect(createCategory).not.toHaveBeenCalled();
    });

    it("creates a new category when no rule matches and no existing category exists", async () => {
        const categoryByName = new Map<string, string>();
        const createdCategoryNames = new Set<string>();
        const syncResult = { categoriesCreated: 0 } as any;

        const result = await resolveCategoryId({
            categoryName: "Unexpected Vendor",
            categoryByName,
            createdCategoryNames,
            result: syncResult,
            matchCategoryByRules: jest.fn().mockResolvedValue(null),
            createCategory: jest.fn().mockResolvedValue({ id: "new-category-id" }),
        });

        expect(result).toBe("new-category-id");
        expect(categoryByName.get("Unexpected Vendor")).toBe("new-category-id");
        expect(createdCategoryNames.has("Unexpected Vendor")).toBe(true);
        expect(syncResult.categoriesCreated).toBe(1);
    });
});
