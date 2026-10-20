import { useQuery } from "@tanstack/vue-query";
import { useApiClient } from "../useApiClient";

export const cashWithdrawalPatternKeys = {
    all: ["cashWithdrawalPatterns"] as const,
    lists: () => [...cashWithdrawalPatternKeys.all, "list"] as const,
    list: () => [...cashWithdrawalPatternKeys.lists()] as const,
};

/** System-seeded plus own patterns; rarely changes, so it never goes stale. */
export function useGetCashWithdrawalPatterns() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: cashWithdrawalPatternKeys.list(),
        queryFn: () => apiClient.getCashWithdrawalPatterns(),
        staleTime: Infinity,
    });
}
