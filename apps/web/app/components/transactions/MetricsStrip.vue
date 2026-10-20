<script setup lang="ts">
import type { ITransactionsSummaryResponse } from "@badger/types";
import { formatCurrency } from "~/utils/currency";

interface Props {
    /** Aggregate totals for the active filters. Undefined while loading or on error. */
    summary?: ITransactionsSummaryResponse;
    /** Show skeleton placeholders instead of values. */
    loading?: boolean;
    /** Mobile collapsed-bar surface. "recessed" (default) reads as sunken
     * relative to the toolbar above it — correct on /transactions, where the
     * strip sits directly under a surface-0 toolbar. "raised" makes it a
     * plain white card like the rest of the dashboard's mobile sections. */
    mobileSurface?: "recessed" | "raised";
}

const props = withDefaults(defineProps<Props>(), {
    summary: undefined,
    loading: false,
    mobileSurface: "recessed",
});

const POSITIVE_CLASS = "text-teal-500";
const NEGATIVE_CLASS = "text-rose-500";
const NEUTRAL_CLASS = "text-surface-600 dark:text-surface-300";

interface MetricCell {
    key: string;
    label: string;
    /** Fully formatted, sign-prefixed value; empty string when no summary. */
    display: string;
    colorClass: string;
}

// Colors and sign conventions follow the app's income/expense convention
// (income/positive = teal, expense/negative = rose).
// A typed object (not an index-keyed record) keeps the mobile variant's
// named lookups — net / income / expenses — safely non-nullable.
const metrics = computed(() => {
    const summary = props.summary;
    const code = summary?.currencyCode;
    const signed = (value: number) => (value >= 0 ? "+" : "") + formatCurrency(value, code);

    return {
        income: {
            key: "income",
            label: "Income",
            display: summary ? `+${formatCurrency(summary.income, code)}` : "",
            colorClass: POSITIVE_CLASS,
        },
        expenses: {
            key: "expenses",
            label: "Expenses",
            display: summary ? `-${formatCurrency(summary.expenses, code)}` : "",
            colorClass: NEGATIVE_CLASS,
        },
        net: {
            key: "net",
            label: "Net",
            display: summary ? signed(summary.net) : "",
            colorClass: summary && summary.net < 0 ? NEGATIVE_CLASS : POSITIVE_CLASS,
        },
        transferred: {
            key: "transferred",
            label: "Transferred",
            display: summary ? formatCurrency(summary.transferred, code) : "",
            colorClass: NEUTRAL_CLASS,
        },
        available: {
            key: "available",
            label: "Available",
            display: summary ? signed(summary.available) : "",
            colorClass: summary && summary.available < 0 ? NEGATIVE_CLASS : POSITIVE_CLASS,
        },
    } satisfies Record<string, MetricCell>;
});

// Desktop: all five cells in order. Mobile expanded grid: everything but Net
// (which lives in the collapsed bar).
const cells = computed<MetricCell[]>(() => {
    const m = metrics.value;
    return [m.income, m.expenses, m.net, m.transferred, m.available];
});
const mobileGridCells = computed<MetricCell[]>(() => {
    const m = metrics.value;
    return [m.income, m.expenses, m.transferred, m.available];
});

// Collapsed by default; tapping the collapsed bar reveals the 2×2 grid.
const expanded = ref(false);
</script>

<template>
    <div>
        <!-- Desktop: single bordered strip of 5 cells (2 rows below xl, 5 across
             at xl+). The surface-toned wrapper bg shows through the 1px grid
             gap as cell separators. -->
        <div
            class="hidden overflow-hidden rounded-xl border border-surface-200 bg-surface-200 md:block dark:border-surface-700 dark:bg-surface-700"
        >
            <!-- Below xl, 6 columns reflow the 5 cells into 2 full rows with no
                 empty cells (Income/Expenses/Net at 2/6 each, Transferred/
                 Available at 3/6 each); xl+ goes back to 5 equal columns. -->
            <div class="grid grid-cols-6 gap-px xl:grid-cols-5">
                <div
                    v-for="cell in cells"
                    :key="cell.key"
                    class="flex flex-col gap-1.5 bg-surface-0 p-4 dark:bg-surface-900"
                    :class="
                        cell.key === 'transferred' || cell.key === 'available'
                            ? 'col-span-3 xl:col-span-1'
                            : 'col-span-2 xl:col-span-1'
                    "
                >
                    <span class="text-[11px] font-medium uppercase tracking-wide text-muted-color">
                        {{ cell.label }}
                    </span>

                    <Skeleton
                        v-if="loading"
                        width="4.5rem"
                        height="1.5rem"
                    />
                    <span
                        v-else-if="!summary"
                        class="whitespace-nowrap text-[22px] font-bold leading-tight text-surface-400"
                    >
                        &mdash;
                    </span>
                    <span
                        v-else
                        class="whitespace-nowrap text-[22px] font-bold leading-tight"
                        :class="cell.colorClass"
                    >
                        {{ cell.display }}
                    </span>
                </div>
            </div>
        </div>

        <!-- Mobile: collapsible summary bar (Net always visible, expands to 2×2).
             Full-bleed: no card, just a strip closed by a bottom border. The
             wrapper stays surface-200/700 in BOTH modes — it is what shows
             through the expanded grid's gap-px to draw the cell separators
             (the expanded cells are surface-0/900 regardless of mode), so
             mobileSurface only changes the collapsed bar button below. -->
        <div class="border-b border-surface-200 bg-surface-200 md:hidden dark:border-surface-700 dark:bg-surface-700">
            <!-- "recessed" (default, /transactions): dips below the toolbar above
                 (surface-0 / surface-900) in both schemes, and matches the list
                 backdrop below, which the strip's border-b separates it from.
                 surface-800 would read as recessed in light but raised in dark —
                 the palette is shared by both schemes, so 800 is lighter than 900.
                 "raised" (dashboard): plain white/dark card like the other
                 mobile sections, so it uses the same surface-0/900 as those. -->
            <button
                type="button"
                class="flex w-full items-center justify-between px-4 py-3 text-left"
                :class="
                    mobileSurface === 'raised'
                        ? 'bg-surface-0 dark:bg-surface-900'
                        : 'bg-surface-50 dark:bg-surface-950'
                "
                :aria-expanded="expanded"
                @click="expanded = !expanded"
            >
                <span class="flex items-baseline gap-2">
                    <span class="text-[11px] font-medium uppercase tracking-wide text-muted-color"> Net </span>
                    <Skeleton
                        v-if="loading"
                        width="4rem"
                        height="1.25rem"
                    />
                    <span
                        v-else-if="!summary"
                        class="text-[20px] font-bold leading-none text-surface-400"
                    >
                        &mdash;
                    </span>
                    <span
                        v-else
                        class="text-[20px] font-bold leading-none"
                        :class="metrics.net.colorClass"
                    >
                        {{ metrics.net.display }}
                    </span>
                </span>

                <span class="flex items-center gap-3">
                    <template v-if="!loading && summary">
                        <span
                            class="text-xs font-semibold"
                            :class="metrics.income.colorClass"
                            >{{ metrics.income.display }}</span
                        >
                        <span
                            class="text-xs font-semibold"
                            :class="metrics.expenses.colorClass"
                            >{{ metrics.expenses.display }}</span
                        >
                    </template>
                    <i
                        class="pi text-xs text-muted-color"
                        :class="expanded ? 'pi-chevron-up' : 'pi-chevron-down'"
                    ></i>
                </span>
            </button>

            <div
                v-if="expanded"
                class="grid grid-cols-2 gap-px border-t border-surface-200 dark:border-surface-700"
            >
                <div
                    v-for="cell in mobileGridCells"
                    :key="cell.key"
                    class="flex flex-col gap-1 bg-surface-0 p-3 dark:bg-surface-900"
                >
                    <span class="text-[11px] font-medium uppercase tracking-wide text-muted-color">
                        {{ cell.label }}
                    </span>
                    <Skeleton
                        v-if="loading"
                        width="3.5rem"
                        height="1.25rem"
                    />
                    <span
                        v-else-if="!summary"
                        class="text-base font-bold leading-tight text-surface-400"
                    >
                        &mdash;
                    </span>
                    <span
                        v-else
                        class="text-base font-bold leading-tight"
                        :class="cell.colorClass"
                    >
                        {{ cell.display }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>
