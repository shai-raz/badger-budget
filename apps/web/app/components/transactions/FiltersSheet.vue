<script setup lang="ts">
import type { TransactionTypeFilter } from "../../composables/transactions/useTransactionFilters";
import { useCategoryToggle } from "../../composables/transactions/useCategoryToggle";

interface CategoryOption {
    value: string;
    label: string;
    /** Category color for the dot (neutral gray for the Uncategorized entry). */
    color: string;
}

const props = defineProps<{
    /** All categories (including the "Uncategorized" pseudo-entry) to offer. */
    categoryOptions: CategoryOption[];
}>();

const emit = defineEmits<{ (event: "clear-all"): void }>();

// Sheet visibility. Filters apply live (state is shared refs) — "Show results"
// merely closes the sheet.
const visible = defineModel<boolean>("visible", { default: false });

const typeFilter = defineModel<TransactionTypeFilter>("typeFilter", { required: true });
// Empty array === all categories included (no filter param sent).
const selectedCategoryIds = defineModel<string[]>("selectedCategoryIds", { required: true });
const showHidden = defineModel<boolean>("showHidden", { required: true });

const typeOptions: Array<{ label: string; value: TransactionTypeFilter }> = [
    { label: "All", value: "all" },
    { label: "Income", value: "income" },
    { label: "Expenses", value: "expense" },
    { label: "Transfers", value: "transfer" },
];

// Category selection math is shared with the desktop inline panel.
const { isAllActive, canInvert, countLabel, isSelected, toggle, selectAll, invert } = useCategoryToggle(
    selectedCategoryIds,
    () => props.categoryOptions,
);

// Drag-to-dismiss on the handle. The gesture itself lives in a generic
// composable; the only sheet-specific parts are the drag target (found via the
// `data-filters-sheet` marker we set on the Drawer root below, resolved per
// drag because PrimeVue mounts a fresh root on every open) and what "dismiss"
// means here.
const handleEl = ref<HTMLElement | null>(null);

useDragToDismiss(handleEl, () => (handleEl.value?.closest("[data-filters-sheet]") as HTMLElement | null) ?? null, {
    onDismiss: () => {
        visible.value = false;
    },
});
</script>

<template>
    <Drawer
        v-model:visible="visible"
        position="bottom"
        :show-close-icon="false"
        :block-scroll="true"
        :pt="{
            root: { class: 'rounded-t-[20px]', 'data-filters-sheet': '', style: { height: 'auto', maxHeight: '80vh' } },
            header: { class: 'hidden' },
            content: { class: 'flex flex-col overflow-hidden p-0' },
        }"
    >
        <!-- ===== STICKY TOP: handle + header + type ===== -->
        <div class="shrink-0 px-4 pt-1">
            <!-- Drag handle — this padded wrapper is the ONLY gesture hit area -->
            <div
                ref="handleEl"
                class="mx-auto mb-3 flex w-full cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
            >
                <div class="h-[5px] w-10 rounded-full bg-surface-300 dark:bg-surface-600"></div>
            </div>

            <!-- Header -->
            <div class="mb-4 flex items-center justify-between">
                <span class="text-base font-bold text-surface-900 dark:text-surface-0">Filters</span>
                <Button
                    label="Clear all"
                    link
                    size="small"
                    @click="emit('clear-all')"
                />
            </div>

            <!-- Type -->
            <span
                class="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400"
            >
                Type
            </span>
            <!-- Full-width on mobile: stretch the SelectButton root and its toggles. -->
            <SelectButton
                v-model="typeFilter"
                :options="typeOptions"
                option-label="label"
                option-value="value"
                :allow-empty="false"
                aria-label="Transaction type"
                class="mb-4 flex w-full"
                :pt="{ pcToggleButton: { root: { class: 'flex-1' } } }"
            />

            <!-- Categories heading — deliberately OUTSIDE the scroller below, so the
                 count and Invert stay reachable with 30+ categories in the list.
                 No tooltip on the disabled Invert here: tooltips never fire on touch. -->
            <div class="mb-1 flex items-center justify-between gap-4">
                <span class="text-[11px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
                    Categories
                </span>
                <div class="flex items-center gap-3">
                    <span class="text-[13px] tabular-nums text-surface-500 dark:text-surface-400">{{
                        countLabel
                    }}</span>
                    <Button
                        label="Invert"
                        icon="pi pi-arrows-h"
                        link
                        size="small"
                        :disabled="!canInvert"
                        aria-label="Invert category selection"
                        @click="invert()"
                    />
                </div>
            </div>
        </div>

        <!-- ===== SCROLLER: categories only (the ONLY scrolling region) ===== -->
        <div class="min-h-0 flex-1 overflow-y-auto px-4">
            <div class="flex flex-col pb-2">
                <!-- The default state. Selection is additive from here, so one tap on a
                     category isolates it and un-selecting the last one comes back here. -->
                <button
                    type="button"
                    :aria-pressed="isAllActive"
                    class="flex items-center justify-between border-b border-surface-200 py-3 text-left dark:border-surface-700"
                    @click="selectAll()"
                >
                    <span class="text-sm font-semibold text-surface-900 dark:text-surface-0">All categories</span>
                    <i
                        v-if="isAllActive"
                        class="pi pi-check text-[13px] text-surface-900 dark:text-surface-0"
                        aria-hidden="true"
                    ></i>
                </button>

                <!-- py-3, not py-2.5: this is a touch-only surface and these rows are its
                     primary control, so they have to clear the 44px touch-target minimum. -->
                <button
                    v-for="option in categoryOptions"
                    :key="option.value"
                    type="button"
                    :aria-pressed="isSelected(option.value)"
                    class="flex items-center gap-3 py-3 text-left"
                    @click="toggle(option.value)"
                >
                    <span
                        class="h-2.5 w-2.5 shrink-0 rounded-full"
                        :class="isSelected(option.value) ? 'opacity-100' : 'opacity-45'"
                        :style="{ backgroundColor: option.color }"
                    ></span>
                    <span
                        class="flex-1 text-sm"
                        :class="
                            isSelected(option.value)
                                ? 'font-semibold text-surface-900 dark:text-surface-0'
                                : 'text-surface-700 dark:text-surface-200'
                        "
                    >
                        {{ option.label }}
                    </span>
                    <i
                        v-if="isSelected(option.value)"
                        class="pi pi-check text-[13px] text-surface-900 dark:text-surface-0"
                        aria-hidden="true"
                    ></i>
                </button>
            </div>
        </div>

        <!-- ===== STICKY BOTTOM: show hidden + Show results ===== -->
        <div
            class="shrink-0 border-t border-surface-200 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-surface-700"
        >
            <div class="mb-3 flex items-center gap-2">
                <ToggleSwitch
                    v-model="showHidden"
                    input-id="sheet-show-hidden"
                />
                <label
                    for="sheet-show-hidden"
                    class="text-sm text-surface-700 dark:text-surface-200"
                >
                    Show hidden transactions
                </label>
            </div>
            <Button
                label="Show results"
                class="w-full"
                @click="visible = false"
            />
        </div>
    </Drawer>
</template>
