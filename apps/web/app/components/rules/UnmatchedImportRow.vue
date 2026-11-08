<script setup lang="ts">
/**
 * The "When no rule matches" row at the top of the Rules page's "Your rules" band. It shows the saved mode and
 * reports an open; the page owns the dialog. Below md the whole row is one button, the way a phone rule row opens.
 * A full-row control needs row semantics, as on the Settings hub, so it is a plain button named by its visible text.
 * Demo accounts and a failed load keep the row visible but disable it.
 */
import type { UnmatchedImportCategoryMode } from "@badger/shared-data";
import { UNMATCHED_IMPORT_CATEGORY_OPTIONS } from "~/utils/unmatchedImportCategory";

const props = defineProps<{
    mode: UnmatchedImportCategoryMode | undefined;
    loading?: boolean;
    error?: unknown;
    /** The demo account can't change the setting. */
    disabled?: boolean;
}>();

const emit = defineEmits<{
    open: [];
}>();

const isDesktop = useIsDesktop();

const option = computed(() => (props.mode ? UNMATCHED_IMPORT_CATEGORY_OPTIONS[props.mode] : undefined));
const isUnavailable = computed(() => !!props.disabled || !!props.loading || !!props.error);
</script>

<template>
    <div
        v-if="isDesktop"
        class="flex items-center gap-3 bg-surface-50 px-4 py-3 md:rounded-xl dark:bg-surface-950"
    >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-200 dark:bg-surface-700">
            <i
                class="pi pi-arrow-down-right"
                aria-hidden="true"
            />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="text-xs text-muted-color">When no rule matches</span>
            <Skeleton
                v-if="loading"
                width="10rem"
                height="1rem"
            />
            <span
                v-else-if="option"
                class="text-sm font-semibold"
                >{{ option.label }}</span
            >
            <span
                v-if="option && !loading"
                class="text-xs text-muted-color"
                >{{ option.hint }}</span
            >
            <span
                v-if="error"
                class="text-xs text-muted-color"
                >Couldn't load this setting.</span
            >
            <span
                v-if="disabled"
                class="text-xs text-muted-color"
                >The demo account can't change this.</span
            >
        </span>
        <Button
            label="Change"
            severity="secondary"
            outlined
            size="small"
            :disabled="isUnavailable"
            @click="emit('open')"
        />
    </div>
    <button
        v-else
        type="button"
        class="flex w-full items-center gap-3 bg-surface-50 px-4 py-3 text-left disabled:opacity-60 dark:bg-surface-950"
        :disabled="isUnavailable"
        @click="emit('open')"
    >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-200 dark:bg-surface-700">
            <i
                class="pi pi-arrow-down-right"
                aria-hidden="true"
            />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="text-xs text-muted-color">When no rule matches</span>
            <Skeleton
                v-if="loading"
                width="10rem"
                height="1rem"
            />
            <span
                v-else-if="option"
                class="text-sm font-semibold"
                >{{ option.label }}</span
            >
            <span
                v-if="error"
                class="text-xs text-muted-color"
                >Couldn't load this setting.</span
            >
            <span
                v-if="disabled"
                class="text-xs text-muted-color"
                >The demo account can't change this.</span
            >
        </span>
        <span class="flex w-8 shrink-0 justify-center">
            <i
                class="pi pi-chevron-right text-muted-color"
                aria-hidden="true"
            />
        </span>
        <span class="sr-only">Change</span>
    </button>
</template>
