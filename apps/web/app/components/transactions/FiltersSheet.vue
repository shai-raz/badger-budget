<script setup lang="ts">
/**
 * The below-md Filters sheet: every transaction filter as collapsed sections (Type, Accounts, Categories) with Show
 * hidden and Clear all, on a bottom sheet. Each section header summarises its selection. Changes apply live, since the
 * selections are the page's URL-backed models; "Show results" only closes the sheet.
 */
import type { TransactionType } from "@badger/shared-data";
import type { FilterOption } from "~/utils/filterOptions";

defineProps<{
    typeOptions: FilterOption<TransactionType>[];
    accountOptions: FilterOption[];
    categoryOptions: FilterOption[];
    /** Every active filter, the period included. Clear all is disabled at zero. */
    activeFilterCount: number;
}>();

const emit = defineEmits<{ (event: "clear-all"): void }>();

const visible = defineModel<boolean>("visible", { default: false });
const selectedTypes = defineModel<TransactionType[]>("selectedTypes", { required: true });
const selectedAccountIds = defineModel<string[]>("selectedAccountIds", { required: true });
const selectedCategoryIds = defineModel<string[]>("selectedCategoryIds", { required: true });
const showHidden = defineModel<boolean>("showHidden", { required: true });
</script>

<template>
    <SharedBottomSheet
        v-model:visible="visible"
        title="Filters"
    >
        <TransactionsFilterSections
            v-model:selected-types="selectedTypes"
            v-model:selected-account-ids="selectedAccountIds"
            v-model:selected-category-ids="selectedCategoryIds"
            v-model:show-hidden="showHidden"
            :type-options="typeOptions"
            :account-options="accountOptions"
            :category-options="categoryOptions"
            :default-expanded="false"
            :active-filter-count="activeFilterCount"
            @clear-all="emit('clear-all')"
        />

        <template #footer>
            <Button
                label="Show results"
                class="w-full"
                @click="visible = false"
            />
        </template>
    </SharedBottomSheet>
</template>
