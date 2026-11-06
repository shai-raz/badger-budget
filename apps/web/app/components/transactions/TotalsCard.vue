<script setup lang="ts">
import type { ITransactionsSummaryResponse } from "@badger/types";
import { spentShare } from "~/utils/spentShare";
import { summaryMetrics } from "~/utils/summaryMetrics";

interface Props {
    /** Aggregate totals for the active filters. Undefined while loading or on error. */
    summary?: ITransactionsSummaryResponse;
    /** Show skeleton placeholders instead of values. */
    loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    summary: undefined,
    loading: false,
});

const metrics = computed(() => summaryMetrics(props.summary));
const share = computed(() => (props.summary ? spentShare(props.summary.income, props.summary.expenses) : undefined));

// Income and expenses are start-aligned; Transferred ends the row so the three
// figures spread across the card's width.
const flows = computed(() => [
    { cell: metrics.value.income, dotClass: "bg-income", align: "items-start" },
    { cell: metrics.value.expenses, dotClass: "bg-expense", align: "items-start" },
    {
        cell: metrics.value.transferred,
        dotClass: "ring-[1.5px] ring-surface-400 dark:ring-surface-500",
        align: "items-end",
    },
]);
</script>

<template>
    <section
        aria-label="Totals"
        class="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 dark:border-surface-700 dark:bg-surface-950"
    >
        <!-- Net and Available: Net leads, Available reads as the secondary figure. -->
        <div class="flex items-baseline justify-between gap-3">
            <div class="flex items-baseline gap-2">
                <span class="text-[11px] uppercase tracking-wide text-muted-color">Net</span>
                <Skeleton
                    v-if="loading"
                    width="4.5rem"
                    height="1.25rem"
                />
                <span
                    v-else-if="!summary"
                    class="text-[17px] font-bold tabular-nums text-surface-400"
                >
                    &mdash;
                </span>
                <span
                    v-else
                    class="text-[17px] font-bold tabular-nums"
                    :class="metrics.net.colorClass"
                >
                    {{ metrics.net.display }}
                </span>
            </div>

            <div class="flex items-baseline gap-2">
                <span class="text-[11px] uppercase tracking-wide text-muted-color">Available</span>
                <Skeleton
                    v-if="loading"
                    width="4rem"
                    height="1rem"
                />
                <span
                    v-else-if="!summary"
                    class="text-sm font-bold tabular-nums text-surface-400"
                >
                    &mdash;
                </span>
                <span
                    v-else
                    class="text-sm font-bold tabular-nums"
                    :class="metrics.available.colorClass"
                >
                    {{ metrics.available.display }}
                </span>
            </div>
        </div>

        <!-- Spent bar: the share of income that went out as expenses. -->
        <div class="my-2 flex items-center gap-2">
            <div
                role="img"
                :aria-label="share?.caption ?? 'Spending not loaded'"
                class="h-1.5 flex-1 overflow-hidden rounded-full"
                style="background: color-mix(in srgb, var(--p-amount-income) 28%, transparent)"
            >
                <div
                    class="h-full rounded-full"
                    :style="{ background: 'var(--p-amount-expense)', width: `${share?.fillPercent ?? 0}%` }"
                ></div>
            </div>
            <Skeleton
                v-if="loading"
                width="4.5rem"
                height="0.75rem"
            />
            <span
                v-else
                class="text-[11px] text-muted-color"
            >
                {{ share?.short ?? "—" }}
            </span>
        </div>

        <!-- Income, Expenses and Transferred at full precision. -->
        <div class="grid grid-cols-3 gap-2">
            <div
                v-for="flow in flows"
                :key="flow.cell.key"
                class="flex flex-col gap-0.5"
                :class="flow.align"
            >
                <span class="flex items-center gap-1.5 text-[11px] text-muted-color">
                    <span
                        class="h-1.5 w-1.5 rounded-full"
                        :class="flow.dotClass"
                    ></span>
                    {{ flow.cell.label }}
                </span>
                <Skeleton
                    v-if="loading"
                    width="4rem"
                    height="1rem"
                />
                <span
                    v-else-if="!summary"
                    class="text-sm font-semibold tabular-nums text-surface-400"
                >
                    &mdash;
                </span>
                <span
                    v-else
                    class="text-sm font-semibold tabular-nums"
                    :class="flow.cell.colorClass"
                >
                    {{ flow.cell.display }}
                </span>
            </div>
        </div>
    </section>
</template>
