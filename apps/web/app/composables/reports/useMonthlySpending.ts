import { computed, type Ref } from "vue";
import { useQueries } from "@tanstack/vue-query";
import { mergeMonthlyPages, stripPageRange } from "~/utils/monthStrip";
import type { MonthKey } from "~/utils/monthRange";
import { useApiClient } from "../useApiClient";
import { reportKeys } from "./useSpendingReport";

/** How long a monthly page counts as fresh. The long window bounds calls to the FX provider. */
const MONTHLY_STALE_MS = 30 * 60 * 1000;

/**
 * Loads the monthly spending totals for the given strip pages. Each page covers 24 months ending
 * at the current month (see `stripPageRange`). The long `staleTime` keeps the FX provider calls
 * bounded, since the totals for past months rarely change.
 */
export function useMonthlySpending(pageIndexes: Ref<number[]>, now: Date) {
    const apiClient = useApiClient();

    const results = useQueries({
        queries: computed(() =>
            pageIndexes.value.map((index) => {
                const range = stripPageRange(index, now);
                return {
                    queryKey: reportKeys.monthly(range),
                    queryFn: () => apiClient.getMonthlySpending(range),
                    staleTime: MONTHLY_STALE_MS,
                };
            }),
        ),
    });

    const merged = computed(() => mergeMonthlyPages(results.value.map((result) => result.data)));

    const totals = computed<Record<MonthKey, number>>(() => merged.value.totals);
    const firstMonth = computed<MonthKey | null>(() => merged.value.firstMonth);
    const error = computed<unknown>(() => results.value.find((result) => result.error)?.error ?? null);

    /** Refetches only the pages that failed. */
    function refetch() {
        for (const result of results.value) {
            if (result.isError) void result.refetch();
        }
    }

    return { totals, firstMonth, error, refetch };
}
