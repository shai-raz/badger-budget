import { useMutation, useQueryClient } from "@tanstack/vue-query";
import type { CreateRuleDto } from "@badger/types";
import { budgetKeys } from "../useBudgets";
import { accountKeys } from "../accounts/accountKeys";
import { reportKeys } from "../reports/useSpendingReport";
import { transactionKeys } from "../transactions/useTransactions";
import { ruleKeys } from "./ruleKeys";

export function useCreateRuleMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (dto: CreateRuleDto) => apiClient.createRule(dto),
        onSuccess: ({ appliedCount }) => {
            queryClient.invalidateQueries({ queryKey: ruleKeys.all });

            // Save-and-apply rewrote transactions, so refresh what useUpdateTransactionMutation refreshes.
            if (appliedCount !== null && appliedCount > 0) {
                queryClient.invalidateQueries({ queryKey: transactionKeys.all });
                queryClient.invalidateQueries({ queryKey: budgetKeys.all });
                queryClient.invalidateQueries({ queryKey: accountKeys.all });
                queryClient.invalidateQueries({ queryKey: reportKeys.all });
            }
        },
    });
}
