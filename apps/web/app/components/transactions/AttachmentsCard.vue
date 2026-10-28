<script setup lang="ts">
import type { ITransactionAttachmentResponse, ITransactionResponse } from "@badger/types";
import { ATTACHMENT_MAX_BYTES } from "@badger/shared-data";
import type { FileUploadUploaderEvent } from "primevue/fileupload";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import {
    useRemoveTransactionAttachment,
    useUploadTransactionAttachments,
} from "~/composables/transactions/useTransactionAttachments";
import {
    ATTACHMENT_ACCEPT,
    attachmentRejectMessage,
    failedUploadsDetail,
    fileIcon,
    fileIconClass,
    fileKind,
    formatFileSize,
    validateAttachmentPick,
} from "~/utils/attachments";

interface Props {
    transaction: ITransactionResponse;
}

const props = defineProps<Props>();

const confirm = useConfirm();
const toast = useToast();
const { uploadFiles } = useUploadTransactionAttachments();
const removeMutation = useRemoveTransactionAttachment();

const attachments = computed(() => props.transaction.attachments ?? []);
const countLabel = computed(() => (attachments.value.length === 1 ? "1 file" : `${attachments.value.length} files`));

const fileUpload = ref();

const handleUpload = async (event: FileUploadUploaderEvent) => {
    const picked = Array.isArray(event.files) ? event.files : [event.files];
    // Reset so picking the same file again re-triggers the uploader event.
    fileUpload.value?.clear();

    const { accepted, rejected } = validateAttachmentPick(picked, attachments.value.length);
    for (const { file, reason } of rejected) {
        const message = attachmentRejectMessage(file.name, reason);
        toast.add({ severity: "warn", summary: message.summary, detail: message.detail, life: 3000 });
    }
    if (accepted.length === 0) return;

    const { failed } = await uploadFiles(props.transaction.id, accepted);
    if (failed.length > 0) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: failedUploadsDetail(failed.map((file) => file.name)),
            life: 5000,
        });
    }
};

const handleRemove = (attachment: ITransactionAttachmentResponse) => {
    confirm.require({
        message: `Remove "${attachment.fileName}"?`,
        header: "Remove attachment",
        icon: "pi pi-exclamation-triangle",
        acceptClass: "p-button-danger",
        accept: async () => {
            try {
                await removeMutation.mutateAsync({
                    transactionId: props.transaction.id,
                    attachmentId: attachment.id,
                });
            } catch (error) {
                console.error("Error removing attachment:", error);
                toast.add({ severity: "error", summary: "Error", detail: "Failed to remove attachment", life: 3000 });
            }
        },
    });
};
</script>

<template>
    <SharedSectionBand
        title="Attachments"
        :empty="attachments.length === 0"
        empty-icon="pi-paperclip"
        empty-text="No attachments yet."
    >
        <template #header-extra>
            <span class="text-surface-500 dark:text-surface-400">{{ countLabel }}</span>
            <FileUpload
                ref="fileUpload"
                mode="basic"
                custom-upload
                auto
                :accept="ATTACHMENT_ACCEPT"
                :max-file-size="ATTACHMENT_MAX_BYTES"
                choose-icon="pi pi-plus"
                choose-label="Add file"
                :choose-button-props="{ severity: 'secondary', outlined: true, size: 'small' }"
                @uploader="handleUpload"
            />
        </template>

        <div class="grid grid-cols-2 gap-3 px-4 md:px-0">
            <div
                v-for="attachment in attachments"
                :key="attachment.id"
                class="relative rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden bg-surface-50 dark:bg-surface-800"
            >
                <div class="h-20 flex items-center justify-center">
                    <span
                        :class="[fileIcon(attachment.mimeType), fileIconClass(attachment.mimeType)]"
                        class="text-2xl"
                    />
                </div>
                <div class="px-2 py-1.5 border-t border-surface-200 dark:border-surface-700">
                    <div class="text-xs font-semibold truncate">{{ attachment.fileName }}</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">
                        {{ fileKind(attachment.mimeType) }} &middot; {{ formatFileSize(attachment.sizeBytes) }}
                    </div>
                </div>
                <Button
                    icon="pi pi-times"
                    text
                    rounded
                    size="small"
                    severity="secondary"
                    class="!absolute top-1 right-1 !w-6 !h-6 !bg-surface-0 dark:!bg-surface-900"
                    aria-label="Remove attachment"
                    @click="handleRemove(attachment)"
                />
            </div>
        </div>

        <template #empty>
            <SharedEmptyState
                icon="pi-paperclip"
                text="No attachments yet."
            />
        </template>
    </SharedSectionBand>
</template>
