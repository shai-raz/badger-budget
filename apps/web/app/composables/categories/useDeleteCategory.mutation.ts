import { useQueryClient } from "@tanstack/vue-query";
import type { Category, DeleteCategoryOptions } from "@badger/types";

type CategoryCacheEntry = Pick<Category, "id"> & Partial<Category>;

export interface DeleteCategoryVariables extends DeleteCategoryOptions {
    id: string;
}

export const useDeleteCategoryMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, transferToCategoryId, moveMappingRules }: DeleteCategoryVariables) => {
            const apiClient = useApiClient();
            return apiClient.deleteCategory(id, { transferToCategoryId, moveMappingRules });
        },
        onMutate: async ({ id }: DeleteCategoryVariables) => {
            await queryClient.cancelQueries({ queryKey: ["categories"] });
            const prev = queryClient.getQueryData(["categories"]);
            queryClient.setQueryData<CategoryCacheEntry[]>(["categories"], (old) => {
                if (!old) return old;
                return old.filter((category) => category.id !== id);
            });
            return { prev };
        },
        onError: (_err, _vars, context) => {
            if (context?.prev) {
                queryClient.setQueryData(["categories"], context.prev);
            }
        },
        onSettled: () => {
            // Category delete may re-point or detach transactions and budgets — refresh those too.
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["budgets"] });
        },
    });
};
