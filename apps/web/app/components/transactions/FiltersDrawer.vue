<script setup lang="ts">
/**
 * The narrow-desktop Filters drawer: a right-hand drawer over the page, opened with its sections expanded. Changes
 * apply live, since the selections are the page's URL-backed models passed straight through.
 */
import type { TransactionType } from "@badger/shared-data";
import type { FilterOption } from "~/utils/filterOptions";

defineProps<{
    typeOptions: FilterOption<TransactionType>[];
    accountOptions: FilterOption[];
    categoryOptions: FilterOption[];
    /** Drawer filters and the period. Clear all is disabled at zero. */
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
    <Drawer
        v-model:visible="visible"
        position="right"
        header="Filters"
        :pt="{ root: { class: 'w-[22rem]' } }"
    >
        <TransactionsFilterSections
            v-model:selected-types="selectedTypes"
            v-model:selected-account-ids="selectedAccountIds"
            v-model:selected-category-ids="selectedCategoryIds"
            v-model:show-hidden="showHidden"
            :type-options="typeOptions"
            :account-options="accountOptions"
            :category-options="categoryOptions"
            default-expanded
            :active-filter-count="activeFilterCount"
            @clear-all="emit('clear-all')"
        />
    </Drawer>
</template>
