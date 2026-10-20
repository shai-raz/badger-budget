<script setup lang="ts">
import type { ITransactionAttachmentResponse, ITransactionResponse } from "@badger/types";
import type { FileUploadUploaderEvent } from "primevue/fileupload";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import {
    useAddTransactionAttachment,
    useRemoveTransactionAttachment,
} from "~/composables/transactions/useTransactionAttachments";

interface Props {
    transaction: ITransactionResponse;
}

const props = defineProps<Props>();

const confirm = useConfirm();
const toast = useToast();
const addMutation = useAddTransactionAttachment();
const removeMutation = useRemoveTransactionAttachment();

const attachments = computed(() => props.transaction.attachments ?? []);
const countLabel = computed(() => (attachments.value.length === 1 ? "1 file" : `${attachments.value.length} files`));

const fileUpload = ref();

const handleUpload = async (event: FileUploadUploaderEvent) => {
    const file = Array.isArray(event.files) ? event.files[0] : event.files;
    // Reset so picking the same file again re-triggers the uploader event.
    fileUpload.value?.clear();
    if (!file) return;

    if (file.size === 0) {
        toast.add({ severity: "warn", summary: "Empty file", detail: "This file has no content", life: 3000 });
        return;
    }

    try {
        await addMutation.mutateAsync({
            transactionId: props.transaction.id,
            data: {
                fileName: file.name,
                mimeType: file.type || "application/octet-stream",
                sizeBytes: file.size,
            },
        });
    } catch (error) {
        console.error("Error adding attachment:", error);
        toast.add({ severity: "error", summary: "Error", detail: "Failed to add attachment", life: 3000 });
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

const fileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return "pi pi-image";
    if (mimeType === "application/pdf") return "pi pi-file-pdf";
    return "pi pi-file";
};

const fileIconClass = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return "text-teal-500";
    if (mimeType === "application/pdf") return "text-rose-500";
    return "text-surface-500 dark:text-surface-400";
};

const fileKind = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return "Photo";
    if (mimeType === "application/pdf") return "PDF";
    return "File";
};

const formatFileSize = (bytes: number) => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
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
                accept="image/*,application/pdf"
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

        <p class="px-4 pt-3 pb-4 text-center text-xs text-surface-500 dark:text-surface-400 md:px-0 md:pb-0">
            Files aren't uploaded yet — only file details are saved for now.
        </p>

        <template #empty>
            <SharedEmptyState
                icon="pi-paperclip"
                text="No attachments yet."
            />
            <p class="px-4 pb-4 text-center text-xs text-surface-500 dark:text-surface-400 md:px-0 md:pb-0">
                Files aren't uploaded yet — only file details are saved for now.
            </p>
        </template>
    </SharedSectionBand>
</template>
