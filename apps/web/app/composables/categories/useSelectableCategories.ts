import type { MaybeRefOrGetter } from "vue";
import type { Category } from "@badger/types";

/**
 * Single source of truth for "which categories are selectable" (e.g. as a
 * CategorySelect option or a delete-transfer target): excludes `excludeId`,
 * and hides system categories when the user has toggled them off, unless
 * `keepId` explicitly keeps one visible.
 */
export const useSelectableCategories = (
    excludeId?: MaybeRefOrGetter<string | null | undefined>,
    keepId?: MaybeRefOrGetter<string | null | undefined>,
) => {
    const { data: categories, isLoading } = useGetCategoriesQuery();
    const { hideSystemCategories } = useSystemCategoryVisibility();

    const options = computed<Category[]>(() => {
        const all = (categories.value ?? []) as Category[];
        const excludeIdValue = toValue(excludeId);
        const keepIdValue = toValue(keepId);
        return all.filter((c) => {
            if (excludeIdValue && c.id === excludeIdValue) return false;
            if (!hideSystemCategories.value) return true;
            // When hiding system categories, still keep an explicitly-kept one.
            return !c.isSystem || c.id === keepIdValue;
        });
    });

    return { options, isLoading };
};
