import { computed, type WritableComputedRef } from "vue";
import { currentMonthSelection, parseSelectionQuery, selectionToQuery, type PeriodSelection } from "~/utils/monthRange";

/**
 * The period selection, kept in the `?from`/`?to` query. The URL holds actual months (`from=all` for all time). An
 * absent or invalid value reads as the current month. The URL is written only when the user changes the selection
 * (through `replace`, so it adds no history entry); reading never writes.
 */
export function useMonthRangeQuery(options: { allowAll: boolean }): {
    selection: WritableComputedRef<PeriodSelection>;
} {
    const route = useRoute();
    const router = useRouter();

    const selection = computed<PeriodSelection>({
        get: () =>
            parseSelectionQuery(
                { from: route.query.from, to: route.query.to },
                { allowAll: options.allowAll, now: new Date() },
            ) ?? currentMonthSelection(new Date()),
        set: (next) => {
            const query = { ...route.query, ...selectionToQuery(next) };
            if (next.kind === "all") delete query.to;
            void router.replace({ query });
        },
    });

    return { selection };
}
