import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/vue-query";
import type { MaybeRefOrGetter } from "vue";
import type { ITransactionListParams, ITransactionSummaryParams } from "@badger/types";
import { useApiClient } from "../useApiClient";
import { accountKeys } from "../accounts/accountKeys";
import type { CreateTransactionPayload } from "../../utils/transactionForm";

// Query keys
export const transactionKeys = {
    all: ["transactions"] as const,
    lists: () => [...transactionKeys.all, "list"] as const,
    infinite: (params: ITransactionListParams) => [...transactionKeys.lists(), "infinite", params] as const,
    recent: (limit: number) => [...transactionKeys.lists(), "recent", limit] as const,
    summary: (params: ITransactionSummaryParams) => [...transactionKeys.all, "summary", params] as const,
    details: () => [...transactionKeys.all, "detail"] as const,
    detail: (id: string) => [...transactionKeys.details(), id] as const,
};

/**
 * Unfiltered full transaction list, used by the budget detail page. Filtering
 * lives in `useInfiniteTransactions`/`useTransactionsSummary`.
 */
export function useGetTransactions() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: transactionKeys.lists(),
        queryFn: () => apiClient.getTransactions(),
    });
}

/**
 * Server-side paginated transaction list for the redesigned page. Each page is
 * a {@link PaginatedResponse}; consumers flatten `pages.flatMap(p => p.data)`.
 * `keepPreviousData` keeps the current rows visible while a filter change
 * refetches, so the list never flashes empty.
 */
export function useInfiniteTransactions(params: Ref<ITransactionListParams>) {
    const apiClient = useApiClient();

    return useInfiniteQuery({
        queryKey: computed(() => transactionKeys.infinite(params.value)),
        queryFn: ({ pageParam }) => apiClient.getTransactionsPaginated({ ...params.value, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
        placeholderData: keepPreviousData,
    });
}

/**
 * Latest `limit` transactions (most recent first), for the dashboard's Recent
 * transactions band. Keyed under `lists()` so a create/delete's root-key
 * invalidation refreshes it too.
 */
export function useRecentTransactions(limit: MaybeRefOrGetter<number>) {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: computed(() => transactionKeys.recent(toValue(limit))),
        queryFn: () =>
            apiClient
                .getTransactionsPaginated({
                    page: 1,
                    limit: toValue(limit),
                    sortBy: "transactionDate",
                    sortOrder: "desc",
                    includeHidden: false,
                })
                .then((r) => r.data),
    });
}

/**
 * Aggregate totals (income/expenses/net/transferred/available) for the current
 * filters. Always excludes hidden transactions server-side.
 */
export function useTransactionsSummary(params: Ref<ITransactionSummaryParams>) {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: computed(() => transactionKeys.summary(params.value)),
        queryFn: () => apiClient.getTransactionsSummary(params.value),
        placeholderData: keepPreviousData,
    });
}

export function useGetTransaction(id: Ref<string> | string) {
    const apiClient = useApiClient();
    const transactionId = computed(() => unref(id));

    return useQuery({
        queryKey: computed(() => transactionKeys.detail(transactionId.value)),
        queryFn: () => apiClient.getTransaction(transactionId.value),
        enabled: computed(() => !!transactionId.value),
    });
}

export function useCreateTransaction() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateTransactionPayload) => apiClient.createTransaction(data),
        onSuccess: () => {
            // Widened to the root key so the infinite list and summary refresh too.
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
            // Cash-wallet balances are derived from transactions.
            queryClient.invalidateQueries({ queryKey: accountKeys.all });
        },
    });
}

export function useDeleteTransaction() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => apiClient.deleteTransaction(id),
        onSuccess: (_, id) => {
            // Widened to the root key so the infinite list and summary refresh too.
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
            queryClient.invalidateQueries({ queryKey: transactionKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: accountKeys.all });
        },
    });
}
