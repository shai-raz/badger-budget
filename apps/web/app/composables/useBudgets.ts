import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import type { BudgetAnalytics, BudgetDashboard, BudgetPeriodSummary } from "@badger/types";
import { useApiClient } from "./useApiClient";

type BudgetPeriod = "daily" | "weekly" | "monthly" | "yearly";

// Query keys
export const budgetKeys = {
    all: ["budgets"] as const,
    lists: () => [...budgetKeys.all, "list"] as const,
    list: () => [...budgetKeys.lists()] as const,
    details: () => [...budgetKeys.all, "detail"] as const,
    detail: (id: string) => [...budgetKeys.details(), id] as const,
    // Prefix (all offsets) — use for invalidation.
    analyticsAll: (id: string) => [...budgetKeys.all, "analytics", id] as const,
    analytics: (id: string, offset = 0) => [...budgetKeys.analyticsAll(id), offset] as const,
    // Prefix (default dashboard + all period sections) — use for invalidation.
    dashboard: () => [...budgetKeys.all, "dashboard"] as const,
    dashboardPeriod: (period: BudgetPeriod, offset: number) => [...budgetKeys.dashboard(), period, offset] as const,
};

// Composables
export function useGetBudgets() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: budgetKeys.list(),
        queryFn: () => apiClient.getBudgets(),
    });
}

export function useGetBudget(id: Ref<string> | string) {
    const apiClient = useApiClient();
    const budgetId = computed(() => unref(id));

    return useQuery({
        queryKey: computed(() => budgetKeys.detail(budgetId.value)),
        queryFn: () => apiClient.getBudget(budgetId.value),
        enabled: computed(() => !!budgetId.value),
    });
}

export function useGetBudgetAnalytics(id: Ref<string> | string, offset: Ref<number> | number = 0) {
    const apiClient = useApiClient();
    const budgetId = computed(() => unref(id));
    const periodOffset = computed(() => unref(offset));

    return useQuery<BudgetAnalytics>({
        queryKey: computed(() => budgetKeys.analytics(budgetId.value, periodOffset.value)),
        queryFn: () =>
            apiClient.getBudgetAnalytics(budgetId.value, {
                periodOffset: periodOffset.value,
            }),
        enabled: computed(() => !!budgetId.value),
        // Keep the previous period's data visible while the next one loads.
        placeholderData: (previous) => previous,
    });
}

export function useGetBudgetDashboard() {
    const apiClient = useApiClient();

    return useQuery<BudgetDashboard>({
        queryKey: budgetKeys.dashboard(),
        queryFn: () => apiClient.getBudgetDashboard(),
    });
}

/**
 * Fetches one period-type section of the budgets page at the given offset
 * (0 = current period, negative = past). Keyed on (period, offset) so each
 * section navigates independently and past windows stay cached.
 */
export function useGetBudgetPeriodSummary(period: BudgetPeriod, offset: Ref<number> | number) {
    const apiClient = useApiClient();
    const periodOffset = computed(() => unref(offset));

    return useQuery<BudgetPeriodSummary>({
        queryKey: computed(() => budgetKeys.dashboardPeriod(period, periodOffset.value)),
        queryFn: () => apiClient.getBudgetDashboard({ period, periodOffset: periodOffset.value }),
        // Avoid a flash of empty state while stepping between periods.
        placeholderData: (previous) => previous,
    });
}

export function useCreateBudget() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: {
            name: string;
            amount: number;
            currencyId: string;
            period: "daily" | "weekly" | "monthly" | "yearly";
            startDate: string;
            categoryIds: string[];
        }) => apiClient.createBudget(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: budgetKeys.lists() });
            queryClient.invalidateQueries({ queryKey: budgetKeys.dashboard() });
        },
    });
}

export function useUpdateBudget() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            data,
        }: {
            id: string;
            data: Partial<{
                name: string;
                amount: number;
                currencyId: string;
                period: "daily" | "weekly" | "monthly" | "yearly";
                startDate: string;
                categoryIds: string[];
            }>;
        }) => apiClient.updateBudget(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: budgetKeys.lists() });
            queryClient.invalidateQueries({ queryKey: budgetKeys.detail(variables.id) });
            queryClient.invalidateQueries({ queryKey: budgetKeys.analyticsAll(variables.id) });
            queryClient.invalidateQueries({ queryKey: budgetKeys.dashboard() });
        },
    });
}

export function useDeleteBudget() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => apiClient.deleteBudget(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: budgetKeys.lists() });
            queryClient.invalidateQueries({ queryKey: budgetKeys.dashboard() });
        },
    });
}
