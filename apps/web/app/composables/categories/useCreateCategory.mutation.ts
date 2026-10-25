import { useQueryClient } from "@tanstack/vue-query";
import type { Category, CreateCategoryDto } from "@badger/types";

type CategoryCacheEntry = Pick<Category, "id"> & Partial<Category>;

export const useCreateCategoryMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateCategoryDto) => {
            const apiClient = useApiClient();
            return apiClient.createCategory(data);
        },
        onMutate: async (newCategory) => {
            await queryClient.cancelQueries({ queryKey: ["categories"] });
            const prev = queryClient.getQueryData(["categories"]);
            queryClient.setQueryData<CategoryCacheEntry[]>(["categories"], (old) => [
                ...(old || []),
                { id: "temp-id", ...newCategory, icon: newCategory.icon ?? undefined },
            ]);
            return { prev };
        },
        onError: (_err, _newCategory, context) => {
            if (context?.prev) {
                queryClient.setQueryData(["categories"], context.prev);
            }
        },
        onSuccess: (created) => {
            queryClient.setQueryData<CategoryCacheEntry[]>(["categories"], (old) =>
                (old ?? []).map((c) => (c.id === "temp-id" ? created : c)),
            );
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["categories"] });
        },
    });
};
