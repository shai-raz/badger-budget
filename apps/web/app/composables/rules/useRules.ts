import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { IRule } from "@badger/types";
import { ruleKeys } from "./ruleKeys";

function isConflict(error: unknown): boolean {
    return (error as { response?: { status?: number } } | null)?.response?.status === 409;
}

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

/** Saves the full order of the user's rules. The cache is reordered at once; a 409 means the list changed elsewhere, so it refetches. */
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
        onError: (error, _ids, context) => {
            if (context?.previous) {
                queryClient.setQueryData(ruleKeys.list(), context.previous);
            }
            if (isConflict(error)) {
                queryClient.invalidateQueries({ queryKey: ruleKeys.lists() });
            }
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
