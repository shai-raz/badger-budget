<script setup lang="ts">
/**
 * The "When no rule matches" dialog: one radio row per mode, saved through the user settings mutation. The
 * selection starts from the saved mode each time the dialog opens. On an error the dialog stays open with the
 * message above the form.
 */
import type { UnmatchedImportCategoryMode } from "@badger/shared-data";
import { getApiErrorMessage } from "~/utils/apiError";
import { UNMATCHED_IMPORT_CATEGORY_OPTIONS, UNMATCHED_IMPORT_CATEGORY_ORDER } from "~/utils/unmatchedImportCategory";

const props = defineProps<{
    mode: UnmatchedImportCategoryMode;
}>();

const visible = defineModel<boolean>("visible", { required: true });

const { mutate, isPending } = useUpdateUserSettingsMutation();

const selected = ref<UnmatchedImportCategoryMode>(props.mode);
const apiError = ref<string | null>(null);

watch(visible, (open) => {
    if (!open) return;
    selected.value = props.mode;
    apiError.value = null;
});

const save = () => {
    apiError.value = null;
    mutate(
        { unmatchedImportCategory: selected.value },
        {
            onSuccess: () => {
                visible.value = false;
            },
            onError: (error) => {
                apiError.value = getApiErrorMessage(error, "Couldn't save this setting.");
            },
        },
    );
};
</script>

<template>
    <SharedFormDialog
        v-model:visible="visible"
        header="When no rule matches"
        :busy="isPending"
        :api-error="apiError"
        initial-focus="dialog"
        @save="save"
    >
        <p class="text-sm">
            Rules always run first. This decides the category of a newly imported transaction that none of them matches.
        </p>

        <div
            role="radiogroup"
            aria-label="When no rule matches"
            class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700"
        >
            <label
                v-for="option in UNMATCHED_IMPORT_CATEGORY_ORDER"
                :key="option"
                :for="`unmatched-import-category-${option}`"
                class="flex w-full cursor-pointer items-start gap-3 py-3"
            >
                <RadioButton
                    v-model="selected"
                    :input-id="`unmatched-import-category-${option}`"
                    :value="option"
                    class="mt-0.5 shrink-0"
                />
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="text-sm font-medium">{{ UNMATCHED_IMPORT_CATEGORY_OPTIONS[option].label }}</span>
                    <span class="text-xs text-muted-color">{{ UNMATCHED_IMPORT_CATEGORY_OPTIONS[option].hint }}</span>
                </span>
            </label>
        </div>

        <p class="text-xs text-muted-color">
            Applies to new imports from bank sync and Google Sheets. Transactions you already have keep their category.
        </p>
    </SharedFormDialog>
</template>
