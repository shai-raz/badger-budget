<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { ITransactionAttachmentResponse, ITransactionResponse } from "@badger/types";
import { ATTACHMENT_MAX_PER_TRANSACTION, ATTACHMENT_NAME_MAX_LENGTH } from "@badger/shared-data";
import { splitAttachmentFileName } from "@badger/utils";
import { useDropZone } from "@vueuse/core";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useInstanceConfig } from "~/composables/useInstanceConfig";
import {
    useAttachmentUrl,
    useRemoveTransactionAttachment,
    useRenameTransactionAttachment,
    useUploadTransactionAttachments,
} from "~/composables/transactions/useTransactionAttachments";
import { useAuthStore } from "~/stores/auth";
import { getApiErrorMessage } from "~/utils/apiError";
import { ATTACHMENT_BLOCK_NOTE, attachmentUploadBlock, canUseAttachmentStorage } from "~/utils/appConfig";
import {
    ATTACHMENT_ACCEPT,
    ATTACHMENT_EXPIRY_HINT,
    attachmentRejectMessage,
    failedUploadsDetail,
    fileIcon,
    fileIconClass,
    fileKind,
    formatFileSize,
    remainingAttachmentSlots,
    uploadingHeader,
    validateAttachmentPick,
} from "~/utils/attachments";

interface Props {
    transaction: ITransactionResponse;
    isMirror: boolean;
}

const props = defineProps<Props>();

const confirm = useConfirm();
const toast = useToast();
const authStore = useAuthStore();
const instanceConfig = useInstanceConfig();
const { uploads, isUploading, uploadFiles } = useUploadTransactionAttachments();
const removeMutation = useRemoveTransactionAttachment();
const renameMutation = useRenameTransactionAttachment();
const getAttachmentUrl = useAttachmentUrl();

const storageEnabled = computed(() => canUseAttachmentStorage(instanceConfig.data.value));
const block = computed(() => attachmentUploadBlock(instanceConfig.data.value, authStore.user, props.isMirror));
const blockNote = computed(() => (block.value ? ATTACHMENT_BLOCK_NOTE[block.value] : null));

const attachments = computed(() => props.transaction.attachments ?? []);
const attachmentCount = computed(() => attachments.value.length);
const remainingSlots = computed(() => remainingAttachmentSlots(attachmentCount.value));
const uploadingCount = computed(() => uploads.value.filter((upload) => upload.status === "uploading").length);
const headerCount = computed(() =>
    uploadingCount.value > 0
        ? uploadingHeader(uploadingCount.value)
        : `${attachmentCount.value} of ${ATTACHMENT_MAX_PER_TRANSACTION}`,
);

const canAdd = computed(() => block.value === null && !isUploading.value && remainingSlots.value > 0);
const addTooltip = computed(() =>
    block.value === null && remainingSlots.value === 0
        ? `A transaction can have up to ${ATTACHMENT_MAX_PER_TRANSACTION} attachments.`
        : "",
);

// Keyed by URL, not id: a refetch brings a fresh presigned URL, which gets its own try.
const failedThumbnails = reactive(new Set<string>());
const markThumbnailFailed = (url: string | null) => {
    if (url) failedThumbnails.add(url);
};

const handlePick = async (files: File[]) => {
    const { accepted, rejected } = validateAttachmentPick(files, attachmentCount.value);
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

// Drops are refused (no highlight, no upload) while the card can't take files. The default is kept for refused
// drops too, so a file dropped on a blocked card never opens in the browser tab.
const rootRef = ref<HTMLElement | null>(null);
const { isOverDropZone } = useDropZone(rootRef, {
    checkValidity: () => canAdd.value,
    multiple: true,
    preventDefaultForUnhandled: true,
    onDrop: (files) => {
        if (files) void handlePick(files);
    },
});

const fileInput = ref<HTMLInputElement | null>(null);
const openFilePicker = () => fileInput.value?.click();
const onFileInputChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    // Copy the picked files before clearing the input, so the same file can be picked again.
    const picked = Array.from(input.files ?? []);
    input.value = "";
    void handlePick(picked);
};

const isImage = (attachment: ITransactionAttachmentResponse) => attachment.mimeType.startsWith("image/");

const lightbox = ref<{ attachment: ITransactionAttachmentResponse; url: string } | null>(null);
const lightboxOpen = computed({
    get: () => lightbox.value !== null,
    set: (open: boolean) => {
        if (!open) lightbox.value = null;
    },
});

const previewError = () =>
    toast.add({ severity: "error", summary: "Error", detail: "Couldn't open the attachment. Try again.", life: 5000 });

/**
 * Opens an attachment for viewing. Used by the tile click and the ⋮ menu's Preview item, so both behave the same.
 * Each call fetches a fresh inline URL, so a page left open past the URL's lifetime still works.
 */
const openPreview = async (attachment: ITransactionAttachmentResponse): Promise<void> => {
    if (!storageEnabled.value) return;

    if (isImage(attachment)) {
        try {
            const { url } = await getAttachmentUrl(props.transaction.id, attachment.id, "inline");
            lightbox.value = { attachment, url };
        } catch (error) {
            console.error("Error opening attachment:", error);
            previewError();
        }
        return;
    }

    // PDF. The tab opens synchronously, before any await: Safari and iOS block window.open after one.
    const win = window.open("", "_blank");
    // noopener would make open() return null, so cut the link by hand before the tab navigates to user-uploaded content.
    if (win) win.opener = null;
    try {
        const { url } = await getAttachmentUrl(props.transaction.id, attachment.id, "inline");
        if (win) win.location.href = url;
        else window.location.assign(url);
    } catch (error) {
        win?.close();
        console.error("Error opening attachment:", error);
        previewError();
    }
};

const downloadAttachment = async (attachment: ITransactionAttachmentResponse) => {
    if (!storageEnabled.value) return;
    try {
        // The signed URL carries Content-Disposition: attachment, so the browser downloads it and this page stays put.
        const { url } = await getAttachmentUrl(props.transaction.id, attachment.id, "attachment");
        window.location.assign(url);
    } catch (error) {
        console.error("Error downloading attachment:", error);
        toast.add({
            severity: "error",
            summary: "Error",
            detail: "Couldn't download the attachment. Try again.",
            life: 5000,
        });
    }
};

const renameTarget = ref<ITransactionAttachmentResponse | null>(null);
const renameBase = ref("");
const renameError = ref<string | null>(null);
const renameExt = computed(() => (renameTarget.value ? splitAttachmentFileName(renameTarget.value.fileName).ext : ""));
const renameMaxLength = computed(() => ATTACHMENT_NAME_MAX_LENGTH - renameExt.value.length - 1);
const renameVisible = computed(() => renameTarget.value !== null);
const renamePending = computed(() => renameMutation.isPending.value);

const openRename = (attachment: ITransactionAttachmentResponse) => {
    renameTarget.value = attachment;
    renameBase.value = splitAttachmentFileName(attachment.fileName).base;
    renameError.value = null;
};

const closeRename = () => {
    renameTarget.value = null;
};

const onRenameVisibleChange = (open: boolean) => {
    if (!open) closeRename();
};

const submitRename = async () => {
    const target = renameTarget.value;
    const base = renameBase.value.trim();
    if (!target || !base) return;

    const fileName = renameExt.value ? `${base}.${renameExt.value}` : base;
    renameError.value = null;
    try {
        await renameMutation.mutateAsync({
            transactionId: props.transaction.id,
            attachmentId: target.id,
            fileName,
        });
        closeRename();
    } catch (error) {
        renameError.value = getApiErrorMessage(error, "Couldn't rename the attachment. Try again.");
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

// Every tile shares one ⋮ menu, pointed at the tile it was opened from.
const actionsMenu = ref();
const menuTarget = ref<ITransactionAttachmentResponse | null>(null);

const menuItems = computed<MenuItem[]>(() => {
    const attachment = menuTarget.value;
    if (!attachment) return [];
    const viewItems: MenuItem[] = storageEnabled.value
        ? [
              {
                  label: "Preview",
                  icon: "pi pi-eye",
                  title: ATTACHMENT_EXPIRY_HINT,
                  command: () => {
                      void openPreview(attachment);
                  },
              },
              {
                  label: "Download",
                  icon: "pi pi-download",
                  command: () => {
                      void downloadAttachment(attachment);
                  },
              },
          ]
        : [];
    return [
        ...viewItems,
        { label: "Rename", icon: "pi pi-pencil", command: () => openRename(attachment) },
        { label: "Delete", icon: "pi pi-trash", command: () => handleRemove(attachment) },
    ];
});

const openMenu = (event: Event, attachment: ITransactionAttachmentResponse) => {
    menuTarget.value = attachment;
    actionsMenu.value?.toggle(event);
};

const percent = (progress: number) => Math.round(progress * 100);
</script>

<template>
    <div
        ref="rootRef"
        class="rounded-xl transition-shadow"
        :class="
            isOverDropZone ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-0 dark:ring-offset-surface-900' : ''
        "
    >
        <SharedSectionBand
            title="Attachments"
            :empty="attachments.length === 0 && uploads.length === 0"
            empty-icon="pi-paperclip"
            empty-text="No attachments yet."
        >
            <template #header-extra>
                <span class="text-muted-color">{{ headerCount }}</span>
                <span
                    v-if="block === null"
                    v-tooltip.top="addTooltip"
                    class="inline-flex"
                >
                    <Button
                        label="Add files"
                        icon="pi pi-plus"
                        severity="secondary"
                        outlined
                        size="small"
                        :disabled="!canAdd"
                        @click="openFilePicker"
                    />
                </span>
            </template>

            <div class="flex flex-col gap-3 px-4 md:px-0">
                <p
                    v-if="blockNote"
                    class="text-xs text-muted-color"
                >
                    {{ blockNote }}
                </p>

                <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div
                        v-for="upload in uploads"
                        :key="upload.id"
                        class="flex flex-col gap-2 overflow-hidden rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800"
                    >
                        <div class="flex min-h-12 items-center gap-2">
                            <span
                                :class="[fileIcon(upload.file.type), fileIconClass(upload.file.type)]"
                                class="text-2xl"
                                aria-hidden="true"
                            />
                            <div class="min-w-0 flex-1">
                                <div class="truncate text-xs font-semibold">{{ upload.file.name }}</div>
                                <div class="text-xs text-muted-color">
                                    {{ fileKind(upload.file.type) }} &middot; {{ formatFileSize(upload.file.size) }}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <ProgressBar
                                :value="percent(upload.progress)"
                                :show-value="false"
                                class="h-1.5 flex-1"
                            />
                            <span class="text-xs tabular-nums text-muted-color">{{ percent(upload.progress) }}%</span>
                        </div>
                    </div>

                    <div
                        v-for="attachment in attachments"
                        :key="attachment.id"
                        class="relative overflow-hidden rounded-lg border border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800"
                    >
                        <component
                            :is="storageEnabled ? 'button' : 'div'"
                            v-bind="
                                storageEnabled
                                    ? {
                                          type: 'button',
                                          'aria-label': `Preview ${attachment.fileName}`,
                                          title: ATTACHMENT_EXPIRY_HINT,
                                      }
                                    : {}
                            "
                            class="block w-full text-left"
                            :class="
                                storageEnabled
                                    ? 'cursor-pointer outline-none hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary dark:hover:bg-surface-700'
                                    : ''
                            "
                            @click="storageEnabled && openPreview(attachment)"
                        >
                            <span class="flex h-20 items-center justify-center overflow-hidden">
                                <img
                                    v-if="attachment.thumbnailUrl && !failedThumbnails.has(attachment.thumbnailUrl)"
                                    :src="attachment.thumbnailUrl"
                                    alt=""
                                    loading="lazy"
                                    class="h-full w-full object-cover"
                                    @error="markThumbnailFailed(attachment.thumbnailUrl)"
                                />
                                <span
                                    v-else
                                    :class="[fileIcon(attachment.mimeType), fileIconClass(attachment.mimeType)]"
                                    class="text-2xl"
                                    aria-hidden="true"
                                />
                            </span>
                            <span class="block border-t border-surface-200 px-2 py-1.5 dark:border-surface-700">
                                <span class="block truncate text-xs font-semibold">{{ attachment.fileName }}</span>
                                <span class="block text-xs text-muted-color">
                                    {{ fileKind(attachment.mimeType) }} &middot;
                                    {{ formatFileSize(attachment.sizeBytes) }}
                                </span>
                            </span>
                        </component>
                        <Button
                            icon="pi pi-ellipsis-v"
                            text
                            rounded
                            size="small"
                            severity="secondary"
                            aria-label="Attachment actions"
                            aria-haspopup="true"
                            class="!absolute top-1 right-1 !h-7 !w-7 !bg-surface-0 dark:!bg-surface-900"
                            @click="openMenu($event, attachment)"
                        />
                    </div>
                </div>

                <p
                    v-if="storageEnabled && attachmentCount > 0"
                    class="flex items-center gap-1.5 text-xs text-muted-color"
                >
                    <i
                        class="pi pi-info-circle"
                        aria-hidden="true"
                    />
                    {{ ATTACHMENT_EXPIRY_HINT }}
                </p>
            </div>

            <template #empty>
                <SharedEmptyState
                    icon="pi-paperclip"
                    text="No attachments yet."
                />
                <p
                    v-if="blockNote"
                    class="px-4 pb-3 text-xs text-muted-color md:px-0"
                >
                    {{ blockNote }}
                </p>
            </template>
        </SharedSectionBand>

        <input
            ref="fileInput"
            type="file"
            multiple
            :accept="ATTACHMENT_ACCEPT"
            class="hidden"
            @change="onFileInputChange"
        />

        <Menu
            ref="actionsMenu"
            :model="menuItems"
            popup
        >
            <!-- PrimeVue's default item ignores MenuItem.title, so the expiry hint is set on the link here. -->
            <template #item="{ item, props: itemProps }">
                <a
                    v-bind="itemProps.action"
                    :title="item.title"
                >
                    <span v-bind="itemProps.icon" />
                    <span v-bind="itemProps.label">{{ item.label }}</span>
                </a>
            </template>
        </Menu>

        <Dialog
            v-model:visible="lightboxOpen"
            :header="lightbox?.attachment.fileName"
            modal
            dismissable-mask
            :draggable="false"
            :style="{ width: 'min(92vw, 56rem)' }"
        >
            <div
                v-if="lightbox"
                class="flex flex-col gap-3"
            >
                <img
                    :src="lightbox.url"
                    :alt="lightbox.attachment.fileName"
                    class="max-h-[80vh] w-full object-contain"
                />
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="text-xs text-muted-color">{{ ATTACHMENT_EXPIRY_HINT }}</p>
                    <Button
                        label="Download"
                        icon="pi pi-download"
                        severity="secondary"
                        outlined
                        size="small"
                        @click="downloadAttachment(lightbox.attachment)"
                    />
                </div>
            </div>
        </Dialog>

        <SharedFormDialog
            :visible="renameVisible"
            header="Rename attachment"
            initial-focus="dialog"
            :busy="renamePending"
            :api-error="renameError"
            :save-disabled="renameBase.trim() === ''"
            @update:visible="onRenameVisibleChange"
            @save="submitRename"
        >
            <div class="flex items-center gap-1">
                <InputText
                    v-model="renameBase"
                    class="min-w-0 flex-1"
                    :maxlength="renameMaxLength"
                    aria-label="Attachment name"
                    @keydown.enter.prevent="submitRename"
                />
                <span class="shrink-0 text-muted-color">.{{ renameExt }}</span>
            </div>
        </SharedFormDialog>
    </div>
</template>
