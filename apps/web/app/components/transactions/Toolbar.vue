<script setup lang="ts">
import type { TransactionType } from "@badger/shared-data";
import { TRANSACTIONS_PRESETS, type PeriodSelection } from "~/utils/monthRange";
import { TRANSACTIONS_TOOLBAR_FULL } from "~/utils/breakpoints";
import type { FilterOption } from "~/utils/filterOptions";

// Desktop-only inputs default to empty, so the mobile instance (which renders only search, period and the Filters
// button) can omit them.
const props = withDefaults(
    defineProps<{
        categoryOptions?: FilterOption[];
        accountOptions?: FilterOption[];
        typeOptions?: FilterOption<TransactionType>[];
        /** Every active filter, the period included. Clear all shows at two or more. */
        activeFilterCount?: number;
        /** Drawer filters only (types, accounts, categories, hidden), shown in the Filters button badge. */
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

// Desktop shows the full toolbar in the body; below md the same controls render
// in the page header's second row (LayoutPageHeader's toolbar slot).
const isDesktop = useIsDesktop();

// Between md and the full-toolbar width the drawer filters move behind a Filters button, and the quick pickers
// scroll sideways beside it. The drawer belongs to this toolbar, so it closes when the layout changes, including
// crossing md, which unmounts the narrow branch that holds it.
const fullToolbar = useMediaQuery(TRANSACTIONS_TOOLBAR_FULL);
const drawerOpen = ref(false);
watch([isDesktop, fullToolbar], () => {
    drawerOpen.value = false;
});

// OverlayBadge always renders its Badge, and a Badge with no value degrades to
// a bare dot — so with no active filters the badge is hidden outright through
// the Badge passthrough rather than by dropping the wrapper.
const filtersBadgePt = computed(() => ({
    pcBadge: { root: { class: props.drawerFilterCount > 0 ? undefined : "hidden" } },
}));
</script>

<template>
    <div>
        <!-- Desktop toolbar: search, then the period and one picker per filter, then show hidden and Clear all. The
             search box shrinks first; everything else keeps its size. -->
        <div
            v-if="isDesktop && fullToolbar"
            class="flex flex-wrap items-center gap-2"
        >
            <IconField class="min-w-[10rem] max-w-[340px] flex-1">
                <InputIcon class="pi pi-search" />
                <InputText
                    v-model="searchQuery"
                    placeholder="Search transactions"
                    class="w-full"
                />
            </IconField>

            <SharedPeriodPicker
                v-model="period"
                class="shrink-0"
                :presets="TRANSACTIONS_PRESETS"
                resettable
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
                class="shrink-0"
                :class="{ invisible: activeFilterCount < 2 }"
                @click="emit('clear-all')"
            />
        </div>

        <!-- Narrow desktop (md up to the full-toolbar width): search and a Filters button, then the quick pickers in one
             row that scrolls sideways. The pickers sit inside the scroll row, but their popovers are appended to the body,
             so the row never clips them. -->
        <div
            v-else-if="isDesktop"
            class="flex items-center gap-2"
        >
            <IconField class="w-[14rem] shrink-0">
                <InputIcon class="pi pi-search" />
                <InputText
                    v-model="searchQuery"
                    placeholder="Search transactions"
                    class="w-full"
                />
            </IconField>

            <!-- The badge counts the drawer filters only. The period has its own picker in the row. -->
            <Button
                label="Filters"
                icon="pi pi-sliders-h"
                size="small"
                severity="secondary"
                outlined
                class="shrink-0"
                :badge="drawerFilterCount > 0 ? String(drawerFilterCount) : undefined"
                badge-severity="info"
                :aria-label="drawerFilterCount > 0 ? `Filters, ${drawerFilterCount} active` : 'Filters'"
                aria-haspopup="dialog"
                :aria-expanded="drawerOpen"
                @click="drawerOpen = true"
            />

            <!-- The toolbar sits on the page scroller, not a card, so the arrows back onto the page colour. -->
            <SharedScrollRow
                class="min-w-0 flex-1"
                label="Quick filters"
                backdrop-class="bg-surface-50 dark:bg-surface-950"
            >
                <SharedPeriodPicker
                    v-model="period"
                    class="shrink-0"
                    :presets="TRANSACTIONS_PRESETS"
                    resettable
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

                <!-- Last in the row, mounted and hidden like the full toolbar's, so its width holds. -->
                <Button
                    label="Clear all"
                    text
                    size="small"
                    class="shrink-0"
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
            <!-- Row 1: search + filter icon-button with count badge -->
            <div class="flex items-center gap-2">
                <IconField class="flex-1">
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
                <!-- Filters toggle. A real Button so the theme supplies the hover
                     and focus-visible states, styled like the desktop toggle
                     above, with the count as an OverlayBadge — same `info` token
                     as the desktop <Badge>, so both render the same colour. The
                     40x40 box matches the adjacent search field's height. -->
                <OverlayBadge
                    :value="drawerFilterCount"
                    severity="info"
                    class="shrink-0"
                    :pt="filtersBadgePt"
                >
                    <Button
                        icon="pi pi-sliders-h"
                        aria-label="Filters"
                        class="h-10 w-10"
                        :outlined="!filtersOpen"
                        :severity="filtersOpen ? undefined : 'secondary'"
                        :aria-expanded="filtersOpen"
                        @click="filtersOpen = !filtersOpen"
                    />
                </OverlayBadge>
            </div>

            <!-- Row 2: period picker. A wide custom range label can run out of
                 room on a narrow phone: the picker shrinks and truncates its label. -->
            <div class="flex min-w-0 items-center">
                <SharedPeriodPicker
                    v-model="period"
                    class="min-w-0"
                    :presets="TRANSACTIONS_PRESETS"
                />
            </div>
        </div>
    </div>
</template>
