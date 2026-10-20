<script setup lang="ts">
import type { TransactionSortOption } from "../../composables/transactions/useTransactionFilters";

type MonthRange = { from: string; to: string };
type TimeframePreset = "this-month" | "last-month" | "custom";

const props = defineProps<{
    /** Number of active filters, shown in the Filters button badge. */
    activeFilterCount: number;
}>();

const searchQuery = defineModel<string>("searchQuery", { default: "" });
const selectedMonthRange = defineModel<MonthRange>("selectedMonthRange", {
    default: () => ({ from: "", to: "" }),
});
const filtersOpen = defineModel<boolean>("filtersOpen", { default: false });
const sortOption = defineModel<TransactionSortOption>("sortOption", { default: "newest" });

// Desktop shows the full toolbar in the body; below md the same controls render
// in the page header's second row (LayoutPageHeader's toolbar slot).
const isDesktop = useIsDesktop();

// YYYY-MM keys for "now" and the previous calendar month. Built by hand from the
// local date parts (never toISOString(), which would shift across timezones).
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
// Computed fresh on each call so a long-lived SPA that crosses a month boundary
// while mounted stays correct without a reload.
const monthKeys = () => {
    const now = new Date();
    return {
        currentMonth: monthKey(now),
        lastMonth: monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    };
};

const timeframeOptions: Array<{ label: string; value: TimeframePreset }> = [
    { label: "This month", value: "this-month" },
    { label: "Last month", value: "last-month" },
    { label: "Custom", value: "custom" },
];

// Explicit custom mode lets the user open the range picker even while the range
// still happens to match a preset.
const explicitCustom = ref(false);

const activeTimeframe = computed<TimeframePreset>(() => {
    if (explicitCustom.value) return "custom";
    const { from, to } = selectedMonthRange.value;
    if (from && from === to) {
        const { currentMonth, lastMonth } = monthKeys();
        if (from === currentMonth) return "this-month";
        if (from === lastMonth) return "last-month";
    }
    return "custom";
});

const showRangePicker = computed(() => activeTimeframe.value === "custom");

function selectTimeframe(preset: TimeframePreset) {
    if (preset === "this-month") {
        explicitCustom.value = false;
        const { currentMonth } = monthKeys();
        selectedMonthRange.value = { from: currentMonth, to: currentMonth };
    } else if (preset === "last-month") {
        explicitCustom.value = false;
        const { lastMonth } = monthKeys();
        selectedMonthRange.value = { from: lastMonth, to: lastMonth };
    } else {
        explicitCustom.value = true;
    }
}

// Compact month label for the mobile header, e.g. "Jul 2026" or "Jul – Sep 2026"
// (shared year collapses to one trailing year). Built from local date parts.
const monthName = (ym: string, opts: Intl.DateTimeFormatOptions) => {
    const [year, month] = ym.split("-").map(Number);
    if (!year || !month) return "";
    return new Date(year, month - 1, 1).toLocaleString("en-US", opts);
};

const monthLabel = computed(() => {
    const { from, to } = selectedMonthRange.value;
    if (!from || !to) return "All dates";
    if (from === to) return monthName(from, { month: "short", year: "numeric" });

    const fromYear = from.split("-")[0];
    const toYear = to.split("-")[0];
    const fromShort = monthName(from, fromYear === toYear ? { month: "short" } : { month: "short", year: "numeric" });
    const toShort = monthName(to, { month: "short", year: "numeric" });
    return `${fromShort} – ${toShort}`;
});

// OverlayBadge always renders its Badge, and a Badge with no value degrades to
// a bare dot — so with no active filters the badge is hidden outright through
// the Badge passthrough rather than by dropping the wrapper.
const filtersBadgePt = computed(() => ({
    pcBadge: { root: { class: props.activeFilterCount > 0 ? undefined : "hidden" } },
}));

// Popover holding the timeframe presets + custom range picker on mobile.
const timeframePopover = ref<{ toggle: (event: Event) => void } | null>(null);
const timeframeOpen = ref(false);
function toggleTimeframe(event: Event) {
    timeframePopover.value?.toggle(event);
}
</script>

<template>
    <div>
        <!-- Desktop toolbar: search + timeframe segmented + Filters toggle -->
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

            <!-- Timeframe segmented control (+ inline range picker when Custom) -->
            <div class="flex flex-wrap items-center gap-2">
                <SelectButton
                    :model-value="activeTimeframe"
                    :options="timeframeOptions"
                    option-label="label"
                    option-value="value"
                    :allow-empty="false"
                    aria-label="Timeframe"
                    @update:model-value="selectTimeframe"
                />
                <SharedMonthRangePicker
                    v-if="showRangePicker"
                    v-model="selectedMonthRange"
                />
            </div>

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

            <!-- Row 2: month label + chevron (opens timeframe presets) left, sort right.
                 A wide custom range label (e.g. "Jul 2025 – Sep 2026") next to the
                 widest sort label can run out of room on a narrow phone; the sort
                 trigger holds its size (shrink-0) and the month label truncates
                 instead of wrapping the row to two lines. -->
            <div class="flex items-center justify-between gap-2">
                <button
                    type="button"
                    class="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-surface-700 dark:text-surface-200"
                    :aria-expanded="timeframeOpen"
                    @click="toggleTimeframe"
                >
                    <span class="min-w-0 truncate">{{ monthLabel }}</span>
                    <i
                        class="pi shrink-0 text-xs"
                        :class="timeframeOpen ? 'pi-chevron-up' : 'pi-chevron-down'"
                    ></i>
                </button>

                <TransactionsSortMenu
                    v-model="sortOption"
                    class="shrink-0"
                />
            </div>

            <Popover
                ref="timeframePopover"
                @show="timeframeOpen = true"
                @hide="timeframeOpen = false"
            >
                <div class="flex min-w-[190px] flex-col gap-2">
                    <SelectButton
                        :model-value="activeTimeframe"
                        :options="timeframeOptions"
                        option-label="label"
                        option-value="value"
                        :allow-empty="false"
                        aria-label="Timeframe"
                        @update:model-value="selectTimeframe"
                    />
                    <SharedMonthRangePicker
                        v-if="showRangePicker"
                        v-model="selectedMonthRange"
                    />
                </div>
            </Popover>
        </div>
    </div>
</template>
