import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "../useApiClient";
import { transactionKeys } from "./useTransactions";

export function useUploadTransactionAttachment() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ transactionId, file }: { transactionId: string; file: File }) =>
            apiClient.uploadTransactionAttachment(transactionId, file, file.name),
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
