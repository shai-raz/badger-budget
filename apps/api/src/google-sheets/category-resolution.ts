import { SyncResultDto } from "./dto";

export interface ResolveCategoryParams {
    categoryName: string;
    categoryByName: Map<string, string>;
    createdCategoryNames: Set<string>;
    result: SyncResultDto;
    matchCategoryByRules: () => Promise<string | null>;
    createCategory: () => Promise<{ id: string }>;
}

export async function resolveCategoryId(params: ResolveCategoryParams): Promise<string | null> {
    const { categoryName, categoryByName, createdCategoryNames, result, matchCategoryByRules, createCategory } = params;
    if (!categoryName) {
        return null;
    }

    const matchedCategory = await matchCategoryByRules();
    if (matchedCategory) {
        return matchedCategory;
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
