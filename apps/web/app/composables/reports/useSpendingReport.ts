import { useQuery } from "@tanstack/vue-query";
import type { SpendingReport } from "@badger/types";
import { useApiClient } from "../useApiClient";

export interface SpendingReportParams {
    startDate: string;
    endDate: string;
    currency?: string;
}

// Query keys
export const reportKeys = {
    all: ["reports"] as const,
    spending: (params: SpendingReportParams) => [...reportKeys.all, "spending", params] as const,
};

export function useSpendingReport(params: Ref<SpendingReportParams>) {
    const apiClient = useApiClient();

    return useQuery<SpendingReport>({
        queryKey: computed(() => reportKeys.spending(params.value)),
        queryFn: () => apiClient.getSpendingReport(params.value),
        enabled: computed(() => !!params.value.startDate && !!params.value.endDate),
        // Keep the previous period's data visible while the next one loads.
        placeholderData: (previous) => previous,
    });
}
