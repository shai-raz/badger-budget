import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import type { MaybeRefOrGetter } from "vue";
import { useApiClient } from "../useApiClient";
import type { IAccountResponse, IUpdateLedgerBalance } from "@badger/types";
import type { AccountType, AvatarIconName } from "@badger/shared-data";
import { transactionKeys } from "../transactions/useTransactions";
import { ruleKeys } from "../rules/ruleKeys";
import { accountKeys } from "./accountKeys";

export { accountKeys };

// Composables
export function useGetAccounts() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: accountKeys.list(),
        queryFn: (): Promise<IAccountResponse[]> => apiClient.getAccounts(),
    });
}

/** The rules an account delete would change, with each outcome. Re-read on every open, so the dialog never shows a stale list. */
export function useAccountRuleUsageQuery(id: MaybeRefOrGetter<string | undefined>, enabled: MaybeRefOrGetter<boolean>) {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: computed(() => accountKeys.ruleUsage(toValue(id) ?? "")),
        queryFn: () => apiClient.getAccountRuleUsage(toValue(id) as string),
        enabled: computed(() => !!toValue(id) && toValue(enabled)),
        staleTime: 0,
    });
}

export function useCreateAccount() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: {
            name: string;
            accountNumber?: string;
            type: AccountType;
            icon?: AvatarIconName | null;
            color?: string;
            currencyId?: string;
        }) => apiClient.createAccount(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
        },
    });
}

export function useUpdateAccount() {
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
                type: AccountType;
                icon: AvatarIconName | null;
                color: string;
                currencyId: string;
            }>;
        }) => apiClient.updateAccount(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
            queryClient.invalidateQueries({ queryKey: accountKeys.detail(id) });
        },
    });
}

export function useDeleteAccount() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => apiClient.deleteAccount(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
            queryClient.invalidateQueries({ queryKey: ruleKeys.all });
        },
    });
}

export function useUpdateLedgerBalance() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: IUpdateLedgerBalance }) =>
            apiClient.updateLedgerBalance(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: accountKeys.all });
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
        },
    });
}
