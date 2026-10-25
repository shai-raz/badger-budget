import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "../useApiClient";
import type { IAccountResponse, IUpdateLedgerBalance } from "@badger/types";
import type { AccountType } from "@badger/shared-data";
import { transactionKeys } from "../transactions/useTransactions";
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

export function useCreateAccount() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: {
            name: string;
            accountNumber?: string;
            type: AccountType;
            icon?: string;
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
            data: Partial<{ name: string; type: AccountType; icon: string; color: string; currencyId: string }>;
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
