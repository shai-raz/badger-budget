import { useMutation, useQueryClient } from "@tanstack/vue-query";

export function useApplyCategoryMappingRuleMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (ruleId: string) => apiClient.applyCategoryMappingRule(ruleId),
        onSuccess: () => {
            // Invalidate transactions to refresh the list
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
        },
    });
}
