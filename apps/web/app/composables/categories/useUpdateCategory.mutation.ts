import { useQueryClient } from "@tanstack/vue-query";
import type { Category, UpdateCategoryDto } from "@badger/types";
import { budgetKeys } from "../useBudgets";
import { reportKeys } from "../reports/useSpendingReport";
import { reimbursementKeys } from "../transactions/useReimbursements";
import { transactionKeys } from "../transactions/useTransactions";

type CategoryCacheEntry = Pick<Category, "id"> & Partial<Category>;

export const useUpdateCategoryMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateCategoryDto }) => {
            const apiClient = useApiClient();
            return apiClient.updateCategory(id, data);
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ["categories"] });
            const prev = queryClient.getQueryData(["categories"]);
            // The cache holds icons as string | undefined: null (cleared) shows as the fallback until the refetch lands.
            const { icon, ...rest } = data;
            const patch: Partial<CategoryCacheEntry> = icon === undefined ? rest : { ...rest, icon: icon ?? undefined };
            queryClient.setQueryData<CategoryCacheEntry[]>(["categories"], (old) => {
                if (!old) return old;
                return old.map((category) => (category.id === id ? { ...category, ...patch } : category));
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
            // A category icon or colour shows on transaction, budget and report rows too — refresh those as well.
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
            queryClient.invalidateQueries({ queryKey: budgetKeys.all });
            queryClient.invalidateQueries({ queryKey: reportKeys.all });
            queryClient.invalidateQueries({ queryKey: reimbursementKeys.all });
        },
    });
};
