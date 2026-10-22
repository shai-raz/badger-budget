import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import { refDebounced } from "@vueuse/core";
import { useToast } from "primevue/usetoast";
import type { ICreateReimbursementAllocation } from "@badger/types";
import { computed, type Ref } from "vue";
import { useApiClient } from "../useApiClient";
import { getApiErrorMessage } from "../../utils/apiError";
import { budgetKeys } from "../useBudgets";
import { reportKeys } from "../reports/useSpendingReport";
import { accountKeys } from "../accounts/accountKeys";
import { transactionKeys } from "./useTransactions";

export const reimbursementKeys = {
    all: ["reimbursements"] as const,
    candidates: (transactionId: string, search: string) =>
        [...reimbursementKeys.all, "candidates", transactionId, search] as const,
};

/**
 * A link changes net amounts, so everything that reads transactions, budgets or
 * spending reports must refetch. Accounts follow transactions everywhere else
 * (cash balances are derived), so they refetch here too.
 */
export async function invalidateReimbursementAffected(queryClient: QueryClient): Promise<void> {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionKeys.all }),
        queryClient.invalidateQueries({ queryKey: budgetKeys.all }),
        queryClient.invalidateQueries({ queryKey: reportKeys.all }),
        queryClient.invalidateQueries({ queryKey: reimbursementKeys.all }),
        queryClient.invalidateQueries({ queryKey: accountKeys.all }),
    ]);
}

/**
 * Link candidates for the picker. `search` is debounced so each keystroke doesn't hit the API;
 * `keepPreviousData` keeps the last list on screen while the next one loads. Only fetches while
 * `open`, so a closed picker never refetches for its last transaction. `staleTime: 0` because
 * ordinary transaction edits don't invalidate these keys, so each open re-checks.
 */
export function useReimbursementCandidates(transactionId: Ref<string | null>, search: Ref<string>, open: Ref<boolean>) {
    const apiClient = useApiClient();
    const debouncedSearch = refDebounced(search, 250);
    // An emptied box must not wait out the debounce: a reopen would otherwise query with the previous search.
    const query = computed(() => (search.value.trim() ? debouncedSearch.value.trim() : ""));

    return useQuery({
        queryKey: computed(() => reimbursementKeys.candidates(transactionId.value ?? "", query.value)),
        queryFn: () => apiClient.getReimbursementCandidates(transactionId.value ?? "", query.value),
        enabled: computed(() => open.value && !!transactionId.value),
        placeholderData: keepPreviousData,
        staleTime: 0,
    });
}

export function useCreateReimbursement() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: ICreateReimbursementAllocation) => apiClient.createReimbursement(data),
        onSuccess: () => invalidateReimbursementAffected(queryClient),
    });
}

export function useUpdateReimbursement() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, amount }: { id: string; amount: number }) => apiClient.updateReimbursement(id, { amount }),
        onSuccess: () => invalidateReimbursementAffected(queryClient),
    });
}

export function useDeleteReimbursement() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const toast = useToast();

    return useMutation({
        mutationFn: (id: string) => apiClient.deleteReimbursement(id),
        onSuccess: () => invalidateReimbursementAffected(queryClient),
        onError: (error) => {
            toast.add({
                severity: "error",
                summary: "Error",
                detail: getApiErrorMessage(error, "Failed to unlink reimbursement"),
                life: 5000,
            });
        },
    });
}
