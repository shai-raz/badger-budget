import { useMutation, useQueryClient } from "@tanstack/vue-query";
import type { CreateCategoryMappingRuleDto } from "@badger/types";

export function useCreateCategoryMappingRuleMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateCategoryMappingRuleDto) => apiClient.createCategoryMappingRule(data),
        onSuccess: () => {
            // Invalidate category mapping rules query if you have one
            queryClient.invalidateQueries({ queryKey: ["categoryMappingRules"] });
        },
    });
}
