import { ref, type Ref } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import type { AttachmentDisposition } from "@badger/shared-data";
import { useApiClient } from "../useApiClient";
import { transactionKeys } from "./useTransactions";
import { uploadAttachmentsInParallel, type AttachmentUploadState } from "../../utils/attachmentUploads";

/**
 * Uploads a batch of files in parallel. `uploads` tracks every batch in flight, and the batch's
 * entries are cleared once the transaction's refetch lands. The transaction is refreshed once per batch, not per file.
 */
export function useUploadTransactionAttachments(): {
    uploads: Ref<AttachmentUploadState[]>;
    /** `error` is the upload's failure, kept so each file's toast can say why it failed. */
    uploadFiles: (transactionId: string, files: File[]) => Promise<{ failed: { file: File; error: unknown }[] }>;
} {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const uploads = ref<AttachmentUploadState[]>([]);

    const uploadFiles = async (transactionId: string, files: File[]) => {
        const batchIds = new Set<string>();

        const syncBatch = (states: AttachmentUploadState[]) => {
            const incoming = new Map(states.map((state) => [state.id, state]));
            states.forEach((state) => batchIds.add(state.id));
            const known = new Set(uploads.value.map((upload) => upload.id));
            const updated = uploads.value.map((upload) => incoming.get(upload.id) ?? upload);
            const added = states.filter((state) => !known.has(state.id));
            uploads.value = [...updated, ...added];
        };

        const { failed } = await uploadAttachmentsInParallel(
            files,
            (file, onProgress) => apiClient.uploadTransactionAttachment(transactionId, file, file.name, { onProgress }),
            syncBatch,
        );

        // Keep the batch's tiles until the refetched detail lands, so the count beside them is never stale.
        await queryClient.invalidateQueries({ queryKey: transactionKeys.detail(transactionId) });
        uploads.value = uploads.value.filter((upload) => !batchIds.has(upload.id));
        // Widened to the root key so the infinite list and summary refresh too. Not awaited: the card doesn't wait on them.
        queryClient.invalidateQueries({ queryKey: transactionKeys.all });

        return { failed };
    };

    return { uploads, uploadFiles };
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

export function useRenameTransactionAttachment() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            transactionId,
            attachmentId,
            fileName,
        }: {
            transactionId: string;
            attachmentId: string;
            fileName: string;
        }) => apiClient.renameTransactionAttachment(transactionId, attachmentId, fileName),
        onSuccess: (_, { transactionId }) => {
            queryClient.invalidateQueries({ queryKey: transactionKeys.detail(transactionId) });
        },
    });
}

/**
 * Fetches a fresh presigned URL on each call. Never cached in vue-query: the URLs expire after an hour.
 */
export function useAttachmentUrl() {
    const apiClient = useApiClient();

    return (transactionId: string, attachmentId: string, disposition: AttachmentDisposition) =>
        apiClient.getTransactionAttachmentUrl(transactionId, attachmentId, disposition);
}
