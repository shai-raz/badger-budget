<script setup lang="ts">
import type { TransactionSortOption } from "../../composables/transactions/useTransactionFilters";
import { TRANSACTIONS_PRESETS, type PeriodSelection } from "~/utils/monthRange";

const props = defineProps<{
    /** Number of active filters, shown in the Filters button badge. */
    activeFilterCount: number;
}>();

const searchQuery = defineModel<string>("searchQuery", { default: "" });
const period = defineModel<PeriodSelection>("period", { required: true });
const filtersOpen = defineModel<boolean>("filtersOpen", { default: false });
const sortOption = defineModel<TransactionSortOption>("sortOption", { default: "newest" });

// Desktop shows the full toolbar in the body; below md the same controls render
// in the page header's second row (LayoutPageHeader's toolbar slot).
const isDesktop = useIsDesktop();

// OverlayBadge always renders its Badge, and a Badge with no value degrades to
// a bare dot — so with no active filters the badge is hidden outright through
// the Badge passthrough rather than by dropping the wrapper.
const filtersBadgePt = computed(() => ({
    pcBadge: { root: { class: props.activeFilterCount > 0 ? undefined : "hidden" } },
}));
</script>

<template>
    <div>
        <!-- Desktop toolbar: search + period picker + Filters toggle -->
        <div
            v-if="isDesktop"
            class="flex flex-wrap items-center gap-3"
        >
            <!-- Search -->
            <IconField class="w-full max-w-[340px] flex-1">
                <InputIcon class="pi pi-search" />
                <InputText
                    v-model="searchQuery"
                    placeholder="Search transactions"
                    class="w-full"
                />
            </IconField>

            <!-- Period picker: ‹ label ▾ › with presets and a month grid -->
            <SharedPeriodPicker
                v-model="period"
                :presets="TRANSACTIONS_PRESETS"
            />

            <!-- Sort menu + Filters toggle -->
            <div class="ml-auto flex items-center gap-2.5">
                <TransactionsSortMenu v-model="sortOption" />

                <Button
                    size="small"
                    :outlined="!filtersOpen"
                    :severity="filtersOpen ? undefined : 'secondary'"
                    :aria-expanded="filtersOpen"
                    @click="filtersOpen = !filtersOpen"
                >
                    <i class="pi pi-sliders-h"></i>
                    <span>Filters</span>
                    <Badge
                        v-if="activeFilterCount > 0"
                        :value="activeFilterCount"
                        severity="info"
                    />
                    <i
                        class="pi"
                        :class="filtersOpen ? 'pi-chevron-up' : 'pi-chevron-down'"
                    ></i>
                </Button>
            </div>
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
                    :value="activeFilterCount"
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

            <!-- Row 2: period picker left, sort right. A wide custom range label
                 can run out of room on a narrow phone; the picker takes the
                 leftover width and truncates its label, while the sort trigger
                 holds its size (shrink-0) so the row never wraps to two lines. -->
            <div class="flex items-center justify-between gap-2">
                <SharedPeriodPicker
                    v-model="period"
                    class="min-w-0"
                    :presets="TRANSACTIONS_PRESETS"
                />

                <TransactionsSortMenu
                    v-model="sortOption"
                    class="shrink-0"
                />
            </div>
        </div>
    </div>
</template>
