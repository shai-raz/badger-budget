import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { CreateRuleDto, IRule, UpdateRuleDto } from "@badger/types";
import { budgetKeys } from "../useBudgets";
import { accountKeys } from "../accounts/accountKeys";
import { reportKeys } from "../reports/useSpendingReport";
import { transactionKeys } from "../transactions/useTransactions";
import { ruleKeys } from "./ruleKeys";

/** A new rule has no id; an edit carries the id of the rule it replaces. */
export type SaveRuleInput = { id: string; dto: UpdateRuleDto } | { id?: undefined; dto: CreateRuleDto };

export function useRulesQuery() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: ruleKeys.list(),
        queryFn: () => apiClient.getRules(),
    });
}

export function useSetRuleActiveMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiClient.setRuleActive(id, isActive),
        onMutate: async ({ id, isActive }) => {
            await queryClient.cancelQueries({ queryKey: ruleKeys.lists() });
            const previous = queryClient.getQueryData<IRule[]>(ruleKeys.list());
            queryClient.setQueryData<IRule[]>(ruleKeys.list(), (old) =>
                old?.map((rule) => (rule.id === id ? { ...rule, isActive } : rule)),
            );
            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(ruleKeys.list(), context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ruleKeys.lists() });
        },
    });
}

/** Saves the full order of the user's rules. The cache is reordered at once and refetched once settled, so a failed or conflicting save cannot leave an order the server does not have on screen. */
export function useReorderRulesMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (ids: string[]) => apiClient.reorderRules(ids),
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ queryKey: ruleKeys.lists() });
            const previous = queryClient.getQueryData<IRule[]>(ruleKeys.list());
            if (previous) {
                const byId = new Map(previous.map((rule) => [rule.id, rule]));
                const listed = ids.flatMap((id) => {
                    const rule = byId.get(id);
                    return rule ? [rule] : [];
                });
                const unlisted = previous.filter((rule) => !ids.includes(rule.id));
                queryClient.setQueryData<IRule[]>(
                    ruleKeys.list(),
                    [...listed, ...unlisted].map((rule, index) => ({ ...rule, priority: index + 1 })),
                );
            }
            return { previous };
        },
        onError: (_error, _ids, context) => {
            if (context?.previous) {
                queryClient.setQueryData(ruleKeys.list(), context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ruleKeys.lists() });
        },
    });
}

export function useDeleteRuleMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => apiClient.deleteRule(id),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ruleKeys.lists() });
        },
    });
}

/** Creates a rule, or updates one when an id is given. With `dto.apply` the save also applies the rule, and the transaction caches refresh when any rows changed. */
export function useSaveRuleMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: SaveRuleInput) =>
            input.id === undefined ? apiClient.createRule(input.dto) : apiClient.updateRule(input.id, input.dto),
        onSuccess: ({ appliedCount }) => {
            queryClient.invalidateQueries({ queryKey: ruleKeys.all });

            if (appliedCount !== null && appliedCount > 0) {
                queryClient.invalidateQueries({ queryKey: transactionKeys.all });
                queryClient.invalidateQueries({ queryKey: budgetKeys.all });
                queryClient.invalidateQueries({ queryKey: accountKeys.all });
                queryClient.invalidateQueries({ queryKey: reportKeys.all });
            }
        },
    });
}
