import { useMutation, useQueryClient } from "@tanstack/vue-query";
import type { ICreateTransactionAttachment } from "@badger/types";
import { useApiClient } from "../useApiClient";
import { transactionKeys } from "./useTransactions";

// Metadata-only phase: the file itself is not uploaded yet, we only persist
// its name/type/size. Actual upload to object storage comes in a later phase.
export function useAddTransactionAttachment() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ transactionId, data }: { transactionId: string; data: ICreateTransactionAttachment }) =>
            apiClient.createTransactionAttachment(transactionId, data),
        onSuccess: (_, { transactionId }) => {
            queryClient.invalidateQueries({ queryKey: transactionKeys.detail(transactionId) });
            // Widened to the root key so the infinite list and summary refresh too.
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
        },
    });
}

export function useRemoveTransactionAttachment() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ transactionId, attachmentId }: { transactionId: string; attachmentId: string }) =>
            apiClient.deleteTransactionAttachment(transactionId, attachmentId),
        onSuccess: (_, { transactionId }) => {
            queryClient.invalidateQueries({ queryKey: transactionKeys.detail(transactionId) });
            // Widened to the root key so the infinite list and summary refresh too.
            queryClient.invalidateQueries({ queryKey: transactionKeys.all });
        },
    });
}
