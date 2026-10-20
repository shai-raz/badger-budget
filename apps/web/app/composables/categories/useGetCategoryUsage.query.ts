import type { MaybeRefOrGetter } from "vue";
import type { CategoryUsageResponse } from "@badger/types";

/**
 * Usage counts (transactions/budgets/mapping rules) for a category, used to drive
 * the delete-category flow. Keyed under ["categories", id, "usage"] so it sits
 * under the ["categories"] prefix and is invalidated whenever categories are.
 */
export const useGetCategoryUsageQuery = (
    id: MaybeRefOrGetter<string | null | undefined>,
    enabled: MaybeRefOrGetter<boolean> = true,
) => {
    return useQuery<CategoryUsageResponse>({
        queryKey: computed(() => ["categories", toValue(id), "usage"]),
        queryFn: async () => {
            const apiClient = useApiClient();
            return apiClient.getCategoryUsage(toValue(id) as string);
        },
        enabled: computed(() => !!toValue(id) && toValue(enabled)),
    });
};
