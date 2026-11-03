import { SyncResultDto } from "./dto";

export interface ResolveCategoryParams {
    categoryName: string;
    categoryByName: Map<string, string>;
    createdCategoryNames: Set<string>;
    result: SyncResultDto;
    matchCategoryByRules: () => string | null;
    createCategory: () => Promise<{ id: string }>;
}

export async function resolveCategoryId(params: ResolveCategoryParams): Promise<string | null> {
    const { categoryName, categoryByName, createdCategoryNames, result, matchCategoryByRules, createCategory } = params;

    // Rules run on every row, including rows with no original category.
    const matchedCategory = matchCategoryByRules();
    if (matchedCategory) {
        return matchedCategory;
    }

    if (!categoryName) {
        return null;
    }

    if (categoryByName.has(categoryName)) {
        return categoryByName.get(categoryName)!;
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
