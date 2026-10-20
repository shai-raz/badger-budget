import { useQueryClient, type InfiniteData } from "@tanstack/vue-query";
import type {
    IUpdateTransaction,
    ITransactionListParams,
    ITransactionResponse,
    PaginatedResponse,
} from "@badger/types";
import { budgetKeys } from "../useBudgets";
import { accountKeys } from "../accounts/accountKeys";
import { transactionKeys } from "./useTransactions";

function isInfiniteTransactions(v: unknown): v is InfiniteData<PaginatedResponse<ITransactionResponse>> {
    return typeof v === "object" && v !== null && "pages" in v && Array.isArray(v.pages);
}

function hasId(v: unknown): v is { id: string } {
    return typeof v === "object" && v !== null && "id" in v && typeof v.id === "string";
}

export function useUpdateTransactionMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<IUpdateTransaction> }) =>
            apiClient.updateTransaction(id, data),
        onMutate: async (updated) => {
            await queryClient.cancelQueries({ queryKey: transactionKeys.all });

            // The "transactions" prefix matches three cache shapes — patch each
            // accordingly: the infinite list (`{ pages: PaginatedResponse[], pageParams }`,
            // from useInfiniteTransactions), the plain array list (useGetTransactions),
            // and a single detail object (useGetTransaction). The summary query
            // (`{ income, expenses, ... }`) also matches this prefix but is deliberately
            // left untouched here — it's recomputed server-side by the onSuccess
            // invalidation below, there's no local row to patch against it.
            const prev = queryClient.getQueriesData({ queryKey: transactionKeys.all });
            prev.forEach(([key]) => {
                queryClient.setQueryData<unknown>(key, (old: unknown) => {
                    if (isInfiniteTransactions(old)) {
                        // Infinite list: key is `[...transactionKeys.lists(), "infinite", params]`,
                        // so key[3] is the ITransactionListParams active for this query.
                        const params = key[3] as ITransactionListParams | undefined;

                        return {
                            ...old,
                            pages: old.pages.map((page: PaginatedResponse<ITransactionResponse>) => {
                                if (!page || !Array.isArray(page.data)) return page;

                                let evictedCount = 0;
                                const data = page.data
                                    .map((tx: ITransactionResponse) =>
                                        tx.id === updated.id ? { ...tx, ...updated.data } : tx,
                                    )
                                    .filter((tx) => {
                                        // Deliberately narrow: only the `includeHidden` filter is
                                        // re-checked here, because Hide is an explicit "make this
                                        // row go away" action and leaving it visible until the
                                        // invalidation refetch lands reads as broken. Every other
                                        // filter (type, categoryIds, search, date range) is left
                                        // for the refetch to reconcile — re-evaluating all of them
                                        // against a patched row gets complicated fast for little
                                        // visible benefit.
                                        const nowExcluded = tx.id === updated.id && !params?.includeHidden && tx.hidden;
                                        if (nowExcluded) evictedCount++;
                                        return !nowExcluded;
                                    });

                                return evictedCount > 0
                                    ? { ...page, data, total: page.total - evictedCount }
                                    : { ...page, data };
                            }),
                        };
                    }
                    if (Array.isArray(old)) {
                        return old.map((tx: ITransactionResponse) =>
                            tx.id === updated.id ? { ...tx, ...updated.data } : tx,
                        );
                    }
                    if (hasId(old) && old.id === updated.id) {
                        return { ...old, ...updated.data };
                    }
                    return old;
                });
            });

            return { prev };
        },
        onError: (_err, _updated, context) => {
            context?.prev?.forEach(([key, data]) => {
                queryClient.setQueryData(key, data);
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
            // Amount/date/category/hidden edits change budget spent/available totals.
            queryClient.invalidateQueries({ queryKey: budgetKeys.all });
            // Cash-wallet balances are derived from transactions.
            queryClient.invalidateQueries({ queryKey: accountKeys.all });
        },
    });
}
