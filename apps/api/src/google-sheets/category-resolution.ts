import type { UnmatchedImportCategoryMode } from "@badger/shared-data";
import { SyncResultDto } from "./dto";

export interface ResolveCategoryParams {
    categoryName: string;
    categoryByName: Map<string, string>;
    createdCategoryNames: Set<string>;
    result: SyncResultDto;
    matchCategoryByRules: () => string | null;
    createCategory: () => Promise<{ id: string }>;
    mode: UnmatchedImportCategoryMode;
}

export async function resolveCategoryId(params: ResolveCategoryParams): Promise<string | null> {
    const { categoryName, categoryByName, createdCategoryNames, result, matchCategoryByRules, createCategory, mode } =
        params;

    // Rules run on every row, including rows with no original category.
    const matchedCategory = matchCategoryByRules();
    if (matchedCategory) {
        return matchedCategory;
    }

    if (!categoryName) {
        return null;
    }

    // "uncategorized" leaves unmatched rows without a category, even when one with the same name exists.
    if (mode === "uncategorized") {
        return null;
    }

    if (categoryByName.has(categoryName)) {
        return categoryByName.get(categoryName)!;
    }

    // "reuse_only" never creates a category, so an unknown name stays uncategorized.
    if (mode === "reuse_only") {
        return null;
    }

    if (createdCategoryNames.has(categoryName)) {
        return null;
    }

    const newCategory = await createCategory();
    categoryByName.set(categoryName, newCategory.id);
    createdCategoryNames.add(categoryName);
    result.categoriesCreated++;
    return newCategory.id;
}
