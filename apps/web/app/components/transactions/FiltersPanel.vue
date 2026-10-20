<script setup lang="ts">
import type { TransactionTypeFilter } from "../../composables/transactions/useTransactionFilters";
import { useCategoryToggle } from "../../composables/transactions/useCategoryToggle";
import { hexToRgba } from "~/utils/color";

interface CategoryOption {
    value: string;
    label: string;
    /** Category color for the dot (neutral gray for the Uncategorized entry). */
    color: string;
}

const props = defineProps<{
    /** All categories (including the "Uncategorized" pseudo-entry) to offer as chips. */
    categoryOptions: CategoryOption[];
}>();

const emit = defineEmits<{ (event: "clear-all"): void }>();

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

// Category selection math is shared with the mobile bottom sheet.
const { isAllActive, canInvert, countLabel, isSelected, toggle, selectAll, invert } = useCategoryToggle(
    selectedCategoryIds,
    () => props.categoryOptions,
);

// PrimeVue 4's Chip has no outlined variant, so the chip frame is ours: every
// state carries a 1px border (widths must match or the chips resize on toggle).
// The font weight is constant for the same reason: these chips sit in a wrap
// row, so anything that resizes one on toggle can rewrap the row and move the
// chips out from under the cursor between two clicks.
const CHIP_BASE = "cursor-pointer border";
const CHIP_IDLE =
    "border-surface-200 bg-surface-0 text-surface-700 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200";

// The "All" chip is the only solid fill. It uses the surface scale, which
// inverts with the scheme, rather than the primary token.
const CHIP_ALL_ACTIVE =
    "border-surface-900 bg-surface-900 text-surface-0 dark:border-surface-0 dark:bg-surface-0 dark:text-surface-900";

// Selected category chips are tinted with the category's own colour, so that
// pair has to be inline — it comes from user data, not from a theme token.
function chipStyle(color: string) {
    return { backgroundColor: hexToRgba(color, 0.13), borderColor: color };
}
</script>

<template>
    <Panel>
        <template #header>
            <span class="text-[13px] font-bold text-surface-900 dark:text-surface-0">Filters</span>
        </template>
        <template #icons>
            <Button
                label="Clear all"
                link
                size="small"
                @click="emit('clear-all')"
            />
        </template>

        <div class="flex flex-wrap gap-9">
            <!-- Type -->
            <div class="flex flex-col gap-2">
                <span class="text-[11px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
                    Type
                </span>
                <SelectButton
                    v-model="typeFilter"
                    :options="typeOptions"
                    option-label="label"
                    option-value="value"
                    :allow-empty="false"
                    aria-label="Transaction type"
                />
            </div>

            <!-- Categories -->
            <div class="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-[340px]">
                <div class="flex items-center justify-between gap-4">
                    <span
                        class="text-[11px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400"
                    >
                        Categories
                    </span>
                    <div class="flex items-center gap-3">
                        <span class="text-[12px] tabular-nums text-surface-500 dark:text-surface-400">
                            {{ countLabel }}
                        </span>
                        <!-- The tooltip hangs off this wrapper rather than the Button: a
                             natively disabled <button> dispatches no mouse events, so a
                             tooltip bound to it can never fire in the one state that most
                             needs the explanation. `canInvert` is also false during the
                             load window, where nothing is selected at all. -->
                        <span
                            v-tooltip.top="
                                canInvert
                                    ? 'Select everything you haven\'t picked'
                                    : 'Pick at least one category to invert'
                            "
                            class="inline-flex"
                        >
                            <Button
                                label="Invert"
                                icon="pi pi-arrows-h"
                                link
                                size="small"
                                :disabled="!canInvert"
                                aria-label="Invert category selection"
                                @click="invert()"
                            />
                        </span>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2">
                    <!-- The default state. Selection is additive from here, so one tap on a
                         category isolates it and un-selecting the last one comes back here. -->
                    <Chip
                        :class="[CHIP_BASE, 'font-semibold', isAllActive ? CHIP_ALL_ACTIVE : CHIP_IDLE]"
                        role="button"
                        tabindex="0"
                        :aria-pressed="isAllActive"
                        @click="selectAll()"
                        @keydown.enter.prevent="selectAll()"
                        @keydown.space.prevent="selectAll()"
                    >
                        <!-- Toggled with `invisible` rather than `v-if`: this chip leads the
                             wrap row, so unmounting the icon would narrow it and shift every
                             chip after it. -->
                        <i
                            class="pi pi-check shrink-0 text-[11px]"
                            :class="{ invisible: !isAllActive }"
                            aria-hidden="true"
                        ></i>
                        <span class="text-[12.5px]">All categories</span>
                    </Chip>

                    <span
                        class="mx-1 my-0.5 w-px self-stretch bg-surface-200 dark:bg-surface-700"
                        aria-hidden="true"
                    ></span>

                    <Chip
                        v-for="option in categoryOptions"
                        :key="option.value"
                        :class="[
                            CHIP_BASE,
                            'font-semibold',
                            isSelected(option.value) ? 'text-surface-900 dark:text-surface-0' : CHIP_IDLE,
                        ]"
                        :style="isSelected(option.value) ? chipStyle(option.color) : undefined"
                        role="button"
                        tabindex="0"
                        :aria-pressed="isSelected(option.value)"
                        @click="toggle(option.value)"
                        @keydown.enter.prevent="toggle(option.value)"
                        @keydown.space.prevent="toggle(option.value)"
                    >
                        <span
                            class="h-2 w-2 shrink-0 rounded-full"
                            :class="isSelected(option.value) ? 'opacity-100' : 'opacity-45'"
                            :style="{ backgroundColor: option.color }"
                        ></span>
                        <span class="text-[12.5px]">{{ option.label }}</span>
                    </Chip>
                </div>
            </div>
        </div>

        <!-- Footer: show hidden -->
        <div class="mt-4 flex items-center gap-2 border-t border-surface-200 pt-3 dark:border-surface-700">
            <ToggleSwitch
                v-model="showHidden"
                input-id="filters-show-hidden"
            />
            <label
                for="filters-show-hidden"
                class="text-[13px] text-surface-700 dark:text-surface-200"
            >
                Show hidden transactions
            </label>
        </div>
    </Panel>
</template>
