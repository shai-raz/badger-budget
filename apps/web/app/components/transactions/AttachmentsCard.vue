<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { ITransactionAttachmentResponse, ITransactionResponse } from "@badger/types";
import { ATTACHMENT_MAX_PER_TRANSACTION, ATTACHMENT_NAME_MAX_LENGTH } from "@badger/shared-data";
import { splitAttachmentFileName } from "@badger/utils";
import type { MenuItem } from "primevue/menuitem";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useInstanceConfig } from "~/composables/useInstanceConfig";
import { useAttachmentDropZone } from "~/composables/transactions/useAttachmentDropZone";
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
    ATTACHMENT_HELPER_TEXT,
    attachmentRejectMessage,
    fileIcon,
    fileKind,
    formatFileSize,
    remainingAttachmentSlots,
    uploadFailureMessage,
    uploadingHeader,
    validateAttachmentPick,
} from "~/utils/attachments";
import { middleTruncateFileName } from "~/utils/attachmentDisplayName";
import AttachmentDropOverlay from "./AttachmentDropOverlay.vue";

interface Props {
    transaction: ITransactionResponse;
    isMirror: boolean;
}

const props = defineProps<Props>();

const confirm = useConfirm();
const toast = useToast();
const authStore = useAuthStore();
const instanceConfig = useInstanceConfig();
const { uploads, uploadFiles } = useUploadTransactionAttachments();
const removeMutation = useRemoveTransactionAttachment();
const renameMutation = useRenameTransactionAttachment();
const getAttachmentUrl = useAttachmentUrl();

const storageEnabled = computed(() => canUseAttachmentStorage(instanceConfig.data.value));
const block = computed(() => attachmentUploadBlock(instanceConfig.data.value, authStore.user, props.isMirror));
const blockNote = computed(() => (block.value ? ATTACHMENT_BLOCK_NOTE[block.value] : null));

const attachments = computed(() => props.transaction.attachments ?? []);
const attachmentCount = computed(() => attachments.value.length);
const uploadingCount = computed(() => uploads.value.filter((upload) => upload.status === "uploading").length);
// Saved attachments plus uploads still in flight. The server enforces the limit under a lock, so a pick made while
// uploads run is still checked there (409); this count only keeps the client from offering slots it can't use.
const occupiedSlots = computed(() => attachmentCount.value + uploadingCount.value);
const remainingSlots = computed(() => remainingAttachmentSlots(occupiedSlots.value));
const headerCount = computed(() =>
    uploadingCount.value > 0
        ? uploadingHeader(uploadingCount.value)
        : `${attachmentCount.value} of ${ATTACHMENT_MAX_PER_TRANSACTION}`,
);

// Why the card can't take files right now, or null when it can. Drives both the Add button and the drop overlay.
const refusal = computed<{ title: string; note: string } | null>(() => {
    const blocked = block.value;
    if (blocked) return { title: "Can't add files here", note: ATTACHMENT_BLOCK_NOTE[blocked] };
    if (remainingSlots.value === 0) {
        return {
            title: "This transaction is full",
            note: `It already has ${ATTACHMENT_MAX_PER_TRANSACTION} attachments. Remove one to add more.`,
        };
    }
    return null;
});
const canAdd = computed(() => refusal.value === null);
const addTooltip = computed(() =>
    block.value === null && remainingSlots.value === 0
        ? `A transaction can have up to ${ATTACHMENT_MAX_PER_TRANSACTION} attachments.`
        : "",
);
const dropOverlay = computed(() =>
    refusal.value
        ? { tone: "refuse" as const, ...refusal.value }
        : {
              tone: "accept" as const,
              title: "Drop files to upload",
              note: `Room for ${remainingSlots.value} more. ${ATTACHMENT_HELPER_TEXT}.`,
          },
);

// Keyed by URL, not id: a refetch brings a fresh presigned URL, which gets its own try.
const failedThumbnails = reactive(new Set<string>());
const markThumbnailFailed = (url: string | null) => {
    if (url) failedThumbnails.add(url);
};

const handlePick = async (files: File[]) => {
    const { accepted, rejected } = validateAttachmentPick(files, occupiedSlots.value);
    for (const { file, reason } of rejected) {
        const message = attachmentRejectMessage(file.name, reason);
        toast.add({ severity: message.severity, summary: message.summary, detail: message.detail, life: 3000 });
    }
    if (accepted.length === 0) return;

    const { failed } = await uploadFiles(props.transaction.id, accepted);
    for (const { file, error } of failed) {
        const message = uploadFailureMessage(file.name, error, "transaction");
        toast.add({ severity: message.severity, summary: message.summary, detail: message.detail, life: 5000 });
    }
};

// The overlay shows for any file drag over the card, including a refused one; refused drops are not uploaded.
const rootRef = ref<HTMLElement | null>(null);
const { isDragging } = useAttachmentDropZone(rootRef, {
    canAccept: () => canAdd.value,
    onDrop: (files) => void handlePick(files),
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
const isPdf = (attachment: ITransactionAttachmentResponse) => attachment.mimeType === "application/pdf";

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
// Over-long names are blocked visibly (red counter, Save off), never cut silently.
const renameTooLong = computed(() => renameBase.value.length > renameMaxLength.value);
const renameSaveDisabled = computed(() => renameBase.value.trim() === "" || renameTooLong.value);

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
    if (!target || !base || renameTooLong.value) return;

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
        message: `Delete "${middleTruncateFileName(attachment.fileName)}"?`,
        header: "Delete attachment",
        icon: "pi pi-exclamation-triangle",
        rejectLabel: "Cancel",
        acceptLabel: "Delete",
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
        class="relative rounded-xl"
    >
        <AttachmentDropOverlay
            v-if="isDragging"
            :tone="dropOverlay.tone"
            :title="dropOverlay.title"
            :note="dropOverlay.note"
        />

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

                <!-- Every tile has the same frame: a 4:3 preview and a fixed-height caption, so names never change its size. -->
                <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <div
                        v-for="upload in uploads"
                        :key="upload.id"
                        class="flex flex-col overflow-hidden rounded-lg border border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900"
                    >
                        <div
                            class="relative flex aspect-[4/3] items-center justify-center bg-surface-100 dark:bg-surface-800"
                        >
                            <span
                                :class="fileIcon(upload.file.type)"
                                class="text-[34px] text-muted-color"
                                aria-hidden="true"
                            />
                            <div
                                class="absolute inset-x-2.5 bottom-2.5 h-1 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700"
                                role="progressbar"
                                aria-valuemin="0"
                                aria-valuemax="100"
                                :aria-valuenow="percent(upload.progress)"
                                :aria-label="`Uploading ${upload.file.name}`"
                            >
                                <div
                                    class="h-full rounded-full bg-primary transition-[width]"
                                    :style="{ width: `${percent(upload.progress)}%` }"
                                />
                            </div>
                        </div>
                        <div
                            class="flex h-11 flex-col justify-center border-t border-surface-200 px-2.5 py-1.5 dark:border-surface-700"
                        >
                            <span
                                dir="auto"
                                class="block truncate text-xs leading-4 font-semibold"
                                >{{ upload.file.name }}</span
                            >
                            <span class="block truncate text-xs leading-4 text-muted-color">
                                Uploading &middot; {{ percent(upload.progress) }}%
                            </span>
                        </div>
                    </div>

                    <div
                        v-for="attachment in attachments"
                        :key="attachment.id"
                        class="relative flex flex-col overflow-hidden rounded-lg border border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900"
                    >
                        <!-- Native element on purpose: a dynamic component named 'button' resolves to the global PrimeVue Button. -->
                        <button
                            type="button"
                            :disabled="!storageEnabled"
                            :aria-label="storageEnabled ? `Preview ${attachment.fileName}` : undefined"
                            :title="storageEnabled ? ATTACHMENT_EXPIRY_HINT : undefined"
                            class="flex flex-1 flex-col text-left"
                            :class="
                                storageEnabled
                                    ? 'cursor-pointer outline-none hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary dark:hover:bg-surface-800'
                                    : 'cursor-default'
                            "
                            @click="openPreview(attachment)"
                        >
                            <span
                                class="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface-100 dark:bg-surface-800"
                            >
                                <img
                                    v-if="attachment.thumbnailUrl && !failedThumbnails.has(attachment.thumbnailUrl)"
                                    :src="attachment.thumbnailUrl"
                                    alt=""
                                    loading="lazy"
                                    class="h-full w-full object-cover"
                                    @error="markThumbnailFailed(attachment.thumbnailUrl)"
                                />
                                <span
                                    v-else-if="isPdf(attachment)"
                                    class="flex flex-col items-center gap-1 text-rose-600 dark:text-rose-400"
                                >
                                    <span
                                        :class="fileIcon(attachment.mimeType)"
                                        class="text-[34px]"
                                        aria-hidden="true"
                                    />
                                    <span class="text-[10px] font-semibold tracking-wider">PDF</span>
                                </span>
                                <span
                                    v-else
                                    :class="fileIcon(attachment.mimeType)"
                                    class="text-[34px] text-muted-color"
                                    aria-hidden="true"
                                />
                            </span>
                            <span class="block h-11 border-t border-surface-200 px-2.5 py-1.5 dark:border-surface-700">
                                <span
                                    dir="auto"
                                    class="block truncate text-xs leading-4 font-semibold"
                                    >{{ attachment.fileName }}</span
                                >
                                <span class="block truncate text-xs leading-4 text-muted-color">
                                    {{ fileKind(attachment.mimeType) }} &middot;
                                    {{ formatFileSize(attachment.sizeBytes) }}
                                </span>
                            </span>
                        </button>
                        <!-- No ! on the background or border: in dev, dark: variants sit outside the layers, so a layered !important beats them. -->
                        <Button
                            icon="pi pi-ellipsis-v"
                            text
                            rounded
                            size="small"
                            severity="secondary"
                            aria-label="Attachment actions"
                            aria-haspopup="true"
                            class="!absolute top-1.5 right-1.5 !h-7 !w-7 !rounded-full border border-surface-200 bg-surface-0 !text-muted-color dark:border-surface-700 dark:bg-surface-900"
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
            modal
            dismissable-mask
            :draggable="false"
            aria-labelledby="attachment-preview-title"
            :style="{ width: 'min(92vw, 56rem)' }"
            :pt="{ content: { class: 'flex min-h-0 flex-1 flex-col gap-3 overflow-hidden' } }"
        >
            <template #header>
                <div class="flex min-w-0 flex-1 items-center gap-2">
                    <span
                        id="attachment-preview-title"
                        class="p-dialog-title min-w-0 flex-1 truncate text-surface-900 dark:text-surface-0"
                        dir="auto"
                        :title="lightbox?.attachment.fileName"
                        >{{ lightbox?.attachment.fileName }}</span
                    >
                    <LayoutHeaderButton
                        v-if="lightbox"
                        label="Download"
                        icon="pi pi-download"
                        aria-label="Download attachment"
                        title="Download"
                        class="shrink-0"
                        @click="downloadAttachment(lightbox.attachment)"
                    />
                </div>
            </template>
            <template v-if="lightbox">
                <img
                    :src="lightbox.url"
                    :alt="lightbox.attachment.fileName"
                    class="mx-auto block min-h-0 max-w-full shrink object-contain max-md:flex-1"
                />
                <p class="shrink-0 text-center text-xs text-muted-color">{{ ATTACHMENT_EXPIRY_HINT }}</p>
            </template>
        </Dialog>

        <SharedFormDialog
            :visible="renameVisible"
            header="Rename attachment"
            initial-focus="dialog"
            :busy="renamePending"
            :api-error="renameError"
            :save-disabled="renameSaveDisabled"
            @update:visible="onRenameVisibleChange"
            @save="submitRename"
        >
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-1">
                    <InputText
                        v-model="renameBase"
                        class="min-w-0 flex-1"
                        :invalid="renameTooLong"
                        aria-label="Attachment name"
                        @keydown.enter.prevent="submitRename"
                    />
                    <span class="shrink-0 text-muted-color">.{{ renameExt }}</span>
                </div>
                <div class="flex items-center justify-end gap-2 text-xs tabular-nums">
                    <span
                        v-if="renameTooLong"
                        class="mr-auto text-rose-700 dark:text-rose-400"
                        >Name is too long</span
                    >
                    <span :class="renameTooLong ? 'text-rose-700 dark:text-rose-400' : 'text-muted-color'">
                        {{ renameBase.length }} / {{ renameMaxLength }}
                    </span>
                </div>
            </div>
        </SharedFormDialog>
    </div>
</template>
