<script setup lang="ts">
import type { TransactionType } from "@badger/shared-data";
import { TRANSACTIONS_PRESETS, type PeriodSelection } from "~/utils/monthRange";
import type { FilterOption } from "~/utils/filterOptions";

// The option lists default to empty. Desktop and the mobile instance both render the pickers, so both pass them; the
// defaults only cover callers that render no pickers at all.
withDefaults(
    defineProps<{
        categoryOptions?: FilterOption[];
        accountOptions?: FilterOption[];
        typeOptions?: FilterOption<TransactionType>[];
        /** Every active filter, the period included. Clear all shows at two or more. */
        activeFilterCount?: number;
        /** Drawer filters only (types, accounts, categories, hidden), shown as the count on the Filters button. */
        drawerFilterCount: number;
    }>(),
    {
        categoryOptions: () => [],
        accountOptions: () => [],
        typeOptions: () => [],
        activeFilterCount: 0,
    },
);

const emit = defineEmits<{ (event: "clear-all"): void }>();

const searchQuery = defineModel<string>("searchQuery", { default: "" });
const period = defineModel<PeriodSelection>("period", { required: true });
const selectedCategoryIds = defineModel<string[]>("selectedCategoryIds", { default: () => [] });
const selectedAccountIds = defineModel<string[]>("selectedAccountIds", { default: () => [] });
const selectedTypes = defineModel<TransactionType[]>("selectedTypes", { default: () => [] });
const showHidden = defineModel<boolean>("showHidden", { default: false });
const filtersOpen = defineModel<boolean>("filtersOpen", { default: false });

// Desktop renders its toolbar in the body; below md the same controls render in the page header's second row
// (LayoutPageHeader's toolbar slot).
const isDesktop = useIsDesktop();

// The desktop drawer belongs to this toolbar, so it closes when the layout changes, including crossing md, which
// unmounts the desktop branch that holds it.
const drawerOpen = ref(false);
watch(isDesktop, () => {
    drawerOpen.value = false;
});
</script>

<template>
    <div>
        <!-- Desktop, one layout from md up: search, a Filters button, then the quick pickers in one row that scrolls
             sideways and never wraps. The pickers sit inside the scroll row, but their popovers are appended to the
             body, so the row never clips them. -->
        <div
            v-if="isDesktop"
            class="flex items-center gap-2"
        >
            <IconField class="w-[340px] min-w-[10rem] shrink-[1000]">
                <InputIcon class="pi pi-search" />
                <InputText
                    v-model="searchQuery"
                    placeholder="Search transactions"
                    class="h-9 w-full"
                />
            </IconField>

            <!-- The badge counts the drawer filters only. The period has its own picker in the row. -->
            <TransactionsFiltersButton
                :count="drawerFilterCount"
                :expanded="drawerOpen"
                @click="drawerOpen = true"
            />

            <!-- The toolbar sits on the page scroller, not a card, so the arrows back onto the page colour. -->
            <SharedScrollRow
                class="min-w-0 flex-auto"
                label="Quick filters"
                backdrop-class="bg-surface-50 dark:bg-surface-950"
            >
                <SharedPeriodPicker
                    v-model="period"
                    class="shrink-0"
                    :presets="TRANSACTIONS_PRESETS"
                    resettable
                    tall
                />

                <TransactionsFilterPicker
                    v-model:selected="selectedCategoryIds"
                    class="shrink-0"
                    noun="categories"
                    :options="categoryOptions"
                />
                <TransactionsFilterPicker
                    v-model:selected="selectedAccountIds"
                    class="shrink-0"
                    noun="accounts"
                    :options="accountOptions"
                />
                <TransactionsFilterPicker
                    v-model:selected="selectedTypes"
                    class="shrink-0"
                    noun="types"
                    :options="typeOptions"
                />

                <TransactionsShowHiddenToggle
                    v-model="showHidden"
                    class="shrink-0"
                />

                <!-- Last in the row. Always mounted and hidden with visibility, so its width holds and the search box
                     never reflows the pickers; visibility also keeps it out of the tab order. -->
                <Button
                    label="Clear all"
                    text
                    size="small"
                    class="h-9 shrink-0"
                    :class="{ invisible: activeFilterCount < 2 }"
                    @click="emit('clear-all')"
                />
            </SharedScrollRow>

            <TransactionsFiltersDrawer
                v-model:visible="drawerOpen"
                v-model:selected-types="selectedTypes"
                v-model:selected-account-ids="selectedAccountIds"
                v-model:selected-category-ids="selectedCategoryIds"
                v-model:show-hidden="showHidden"
                :type-options="typeOptions"
                :account-options="accountOptions"
                :category-options="categoryOptions"
                :active-filter-count="activeFilterCount"
                @clear-all="emit('clear-all')"
            />
        </div>

        <!-- Mobile controls, rendered in the page header's toolbar slot. The header
             supplies the background, the horizontal gutter and the bottom border. -->
        <div
            v-else
            class="flex flex-col gap-3"
        >
            <!-- Row 1: search, full width. -->
            <IconField>
                <InputIcon class="pi pi-search" />
                <!-- Recessed against the toolbar chrome in both schemes, same
                     as the summary bar below. Only light needs the override:
                     the field would otherwise be surface-0, matching the
                     toolbar. Dark restores the theme's own inputtext
                     background (surface-950), which surface-800 overrode to
                     a tone lighter than the surface-900 toolbar. -->
                <InputText
                    v-model="searchQuery"
                    placeholder="Search"
                    class="w-full bg-surface-50 dark:bg-surface-950"
                />
            </IconField>

            <!-- Row 2: a fixed Filters button with the drawer count, then the period and one pill per filter in a row
                 that scrolls sideways. The row bleeds into the right gutter, and its trailing spacer keeps the last pill
                 clear of the screen edge. -->
            <div class="flex items-center gap-2">
                <TransactionsFiltersButton
                    :count="drawerFilterCount"
                    :expanded="filtersOpen"
                    @click="filtersOpen = !filtersOpen"
                />

                <div
                    class="h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-700"
                    aria-hidden="true"
                ></div>

                <SharedScrollRow
                    :arrows="false"
                    class="-mr-4 min-w-0 flex-1"
                    label="Quick filters"
                >
                    <!-- The picker never shrinks in this scrolling row, so a wide custom range label truncates at its own max width. -->
                    <SharedPeriodPicker
                        v-model="period"
                        class="shrink-0"
                        :presets="TRANSACTIONS_PRESETS"
                        resettable
                        tall
                    />

                    <TransactionsFilterPicker
                        v-model:selected="selectedCategoryIds"
                        class="shrink-0"
                        noun="categories"
                        variant="pill"
                        :options="categoryOptions"
                    />
                    <TransactionsFilterPicker
                        v-model:selected="selectedAccountIds"
                        class="shrink-0"
                        noun="accounts"
                        variant="pill"
                        :options="accountOptions"
                    />
                    <TransactionsFilterPicker
                        v-model:selected="selectedTypes"
                        class="shrink-0"
                        noun="types"
                        variant="pill"
                        :options="typeOptions"
                    />

                    <TransactionsShowHiddenToggle
                        v-model="showHidden"
                        class="shrink-0"
                        variant="pill"
                    />

                    <div
                        class="w-3 shrink-0"
                        aria-hidden="true"
                    ></div>
                </SharedScrollRow>
            </div>
        </div>
    </div>
</template>
