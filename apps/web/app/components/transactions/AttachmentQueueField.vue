<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowReactive, watch } from "vue";
import { ATTACHMENT_MAX_PER_TRANSACTION } from "@badger/shared-data";
import { useToast } from "primevue/usetoast";
import { useAttachmentDropZone } from "../../composables/transactions/useAttachmentDropZone";
import {
    ATTACHMENT_ACCEPT,
    ATTACHMENT_HELPER_TEXT,
    attachmentRejectMessage,
    fileIcon,
    fileIconClass,
    fileKind,
    formatFileSize,
    remainingAttachmentSlots,
    uploadingHeader,
    validateAttachmentPick,
} from "../../utils/attachments";
import type { AttachmentUploadState } from "../../utils/attachmentUploads";
import AttachmentDropOverlay from "./AttachmentDropOverlay.vue";

const props = defineProps<{
    modelValue: File[];
    disabled?: boolean;
    /** Upload states for the queued files, matched by File identity. Set while the form's create is running. */
    uploads?: AttachmentUploadState[];
}>();

const emit = defineEmits<{
    "update:modelValue": [files: File[]];
}>();

const toast = useToast();

const labelClass = "text-sm font-medium text-surface-700 dark:text-surface-200";
const helperClass = "text-sm text-surface-500 dark:text-surface-400";
const labelId = "tx-attachments-label";

const remainingSlots = () => remainingAttachmentSlots(props.modelValue.length);

// Object URLs for queued images, keyed by File. Shallow, so the Files themselves are never proxied.
const thumbnails = shallowReactive(new Map<File, string>());

const releaseThumbnail = (file: File) => {
    const url = thumbnails.get(file);
    if (url === undefined) return;
    URL.revokeObjectURL(url);
    thumbnails.delete(file);
};

// Keeps one URL per queued image: creates for new files, revokes for files that left the queue.
watch(
    () => props.modelValue,
    (files) => {
        for (const file of files) {
            if (file.type.startsWith("image/") && !thumbnails.has(file)) {
                thumbnails.set(file, URL.createObjectURL(file));
            }
        }
        for (const file of [...thumbnails.keys()]) {
            if (!files.includes(file)) releaseThumbnail(file);
        }
    },
    { immediate: true },
);

onBeforeUnmount(() => {
    for (const file of [...thumbnails.keys()]) releaseThumbnail(file);
});

const uploadFor = (file: File): AttachmentUploadState | undefined =>
    props.uploads?.find((upload) => upload.file === file);

const isUploading = (file: File) => uploadFor(file)?.status === "uploading";
const hasFailed = (file: File) => uploadFor(file)?.status === "failed";
const isDone = (file: File) => uploadFor(file)?.status === "done";
const percent = (progress: number) => Math.round(progress * 100);

const countLabel = () =>
    props.uploads?.length
        ? uploadingHeader(props.uploads.length)
        : `${props.modelValue.length} of ${ATTACHMENT_MAX_PER_TRANSACTION}`;

const addFiles = (picked: File[]) => {
    const { accepted, rejected } = validateAttachmentPick(picked, props.modelValue.length);
    for (const { file, reason } of rejected) {
        const message = attachmentRejectMessage(file.name, reason);
        toast.add({ severity: "warn", summary: message.summary, detail: message.detail, life: 3000 });
    }
    if (accepted.length > 0) emit("update:modelValue", [...props.modelValue, ...accepted]);
};

const removeFile = (file: File) => {
    releaseThumbnail(file);
    emit(
        "update:modelValue",
        props.modelValue.filter((queued) => queued !== file),
    );
};

// Attached to the always-rendered field root: a refused drop (disabled or queue full) is still swallowed, so a dropped
// file never opens in the browser tab. The overlay says why the drop is refused.
const canAccept = () => !props.disabled && remainingSlots() > 0;
const rootRef = ref<HTMLElement | null>(null);
const { isDragging } = useAttachmentDropZone(rootRef, {
    canAccept,
    onDrop: addFiles,
});

const dropOverlay = computed(() => {
    if (props.disabled) {
        return {
            tone: "refuse" as const,
            title: "Uploads in progress",
            note: "Wait for the current uploads to finish.",
        };
    }
    if (!canAccept()) {
        return {
            tone: "refuse" as const,
            title: "This transaction is full",
            note: `It already has ${ATTACHMENT_MAX_PER_TRANSACTION} attachments. Remove one to add more.`,
        };
    }
    return {
        tone: "accept" as const,
        title: "Drop files to upload",
        note: `Room for ${remainingSlots()} more. ${ATTACHMENT_HELPER_TEXT}.`,
    };
});

const fileInput = ref<HTMLInputElement | null>(null);
const openFilePicker = () => fileInput.value?.click();
const onFileInputChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    // Copy the picked files before clearing the input, so the same file can be picked again.
    const picked = Array.from(input.files ?? []);
    input.value = "";
    addFiles(picked);
};
</script>

<template>
    <div
        ref="rootRef"
        class="relative flex flex-col gap-1"
        role="group"
        :aria-labelledby="labelId"
    >
        <AttachmentDropOverlay
            v-if="isDragging"
            :tone="dropOverlay.tone"
            :title="dropOverlay.title"
            :note="dropOverlay.note"
        />

        <div class="flex items-center justify-between gap-2">
            <span
                :id="labelId"
                :class="labelClass"
            >
                Attachments
            </span>
            <span class="text-sm text-muted-color">{{ countLabel() }}</span>
        </div>

        <ul
            v-if="modelValue.length > 0"
            class="flex flex-col divide-y divide-surface-200 overflow-hidden rounded-lg border border-surface-200 dark:divide-surface-700 dark:border-surface-700"
        >
            <li
                v-for="(file, index) in modelValue"
                :key="index"
                class="flex items-center gap-3 bg-surface-0 px-3 py-2 dark:bg-surface-900"
            >
                <span class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md">
                    <img
                        v-if="thumbnails.has(file)"
                        :src="thumbnails.get(file)"
                        alt=""
                        class="size-full object-cover"
                    />
                    <span
                        v-else
                        :class="[fileIcon(file.type), fileIconClass(file.type)]"
                        class="text-xl"
                        aria-hidden="true"
                    />
                </span>
                <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium">{{ file.name }}</div>
                    <div class="text-xs text-muted-color">
                        {{ fileKind(file.type) }} &middot; {{ formatFileSize(file.size) }}
                    </div>
                </div>

                <template v-if="isUploading(file)">
                    <ProgressBar
                        :value="percent(uploadFor(file)?.progress ?? 0)"
                        :show-value="false"
                        class="h-1.5 w-20"
                    />
                    <span class="w-10 text-right text-xs tabular-nums text-muted-color">
                        {{ percent(uploadFor(file)?.progress ?? 0) }}%
                    </span>
                </template>
                <span
                    v-else-if="hasFailed(file)"
                    class="pi pi-exclamation-circle text-red-500"
                    role="img"
                    aria-label="Upload failed"
                />
                <span
                    v-else-if="isDone(file)"
                    class="pi pi-check-circle text-green-500"
                    role="img"
                    aria-label="Uploaded"
                />

                <Button
                    v-if="!isUploading(file) && !isDone(file)"
                    icon="pi pi-times"
                    text
                    rounded
                    severity="secondary"
                    :aria-label="`Remove ${file.name}`"
                    :disabled="disabled"
                    @click="removeFile(file)"
                />
            </li>
        </ul>

        <div
            v-if="remainingSlots() > 0"
            class="flex flex-col items-center gap-1 rounded-lg border border-dashed border-surface-300 px-4 py-4 text-center dark:border-surface-600"
        >
            <span class="flex items-center gap-1.5 text-sm text-surface-700 dark:text-surface-200">
                <i
                    class="pi pi-paperclip"
                    aria-hidden="true"
                />
                Drop files here or
                <button
                    type="button"
                    class="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    :disabled="disabled"
                    @click="openFilePicker"
                >
                    choose files
                </button>
            </span>
            <small :class="helperClass">{{ ATTACHMENT_HELPER_TEXT }}</small>
            <input
                ref="fileInput"
                type="file"
                multiple
                :accept="ATTACHMENT_ACCEPT"
                class="hidden"
                :disabled="disabled"
                @change="onFileInputChange"
            />
        </div>
    </div>
</template>
