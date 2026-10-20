import { useQueryClient } from "@tanstack/vue-query";
import type { Category } from "@badger/types";

type CategoryCacheEntry = Pick<Category, "id"> & Partial<Category>;

export const useUpdateCategoryMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: { name?: string; color?: string } }) => {
            const apiClient = useApiClient();
            return apiClient.updateCategory(id, data);
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ["categories"] });
            const prev = queryClient.getQueryData(["categories"]);
            queryClient.setQueryData<CategoryCacheEntry[]>(["categories"], (old) => {
                if (!old) return old;
                return old.map((category) => (category.id === id ? { ...category, ...data } : category));
            });
            return { prev };
        },
        onError: (_err, _variables, context) => {
            if (context?.prev) {
                queryClient.setQueryData(["categories"], context.prev);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });
};
