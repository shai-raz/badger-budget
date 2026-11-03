import { keepPreviousData, useInfiniteQuery } from "@tanstack/vue-query";
import { refDebounced } from "@vueuse/core";
import type { RulePreviewFilter } from "@badger/shared-data";
import type { RuleDraft, RulePreviewItem, RulePreviewRequest, RulePreviewResponse } from "@badger/types";
import { computed, toValue, type MaybeRefOrGetter, type Ref } from "vue";
import { useApiClient } from "../useApiClient";
import { ruleKeys } from "./ruleKeys";

/** How long the search must pause before the list is requested again. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The transactions a draft would change, paged for the review view. The search is debounced, but an emptied
 * search applies at once so clearing the box never shows a stale filter. `keepPreviousData` keeps the last rows
 * on screen while the next filter loads. The totals come from the first page, which the server computes for the
 * whole list, not just the rows loaded so far.
 */
export function useRulePreviewList(
    draft: MaybeRefOrGetter<RuleDraft | null>,
    filter: Ref<RulePreviewFilter>,
    search: Ref<string>,
) {
    const apiClient = useApiClient();
    const debouncedSearch = refDebounced(search, SEARCH_DEBOUNCE_MS);
    const appliedSearch = computed(() => (search.value.trim() ? debouncedSearch.value.trim() : ""));

    const request = computed<Omit<RulePreviewRequest, "page"> | null>(() => {
        const current = toValue(draft);
        if (!current) return null;
        return { ...current, filter: filter.value, search: appliedSearch.value };
    });

    const query = useInfiniteQuery({
        queryKey: computed(() => (request.value ? ruleKeys.preview(request.value) : ruleKeys.previews())),
        queryFn: ({ pageParam }) => {
            const current = request.value;
            if (!current) throw new Error("A preview needs a draft");
            return apiClient.previewRule({ ...current, page: pageParam });
        },
        initialPageParam: 1,
        getNextPageParam: (last: RulePreviewResponse) => (last.page < last.totalPages ? last.page + 1 : undefined),
        enabled: computed(() => request.value !== null),
        placeholderData: keepPreviousData,
        // Transactions change outside the review (edits, imports, syncs), so every open counts again.
        staleTime: 0,
    });

    const items = computed<RulePreviewItem[]>(() => query.data.value?.pages.flatMap((page) => page.items) ?? []);
    const firstPage = computed<RulePreviewResponse | null>(() => query.data.value?.pages[0] ?? null);

    return {
        items,
        wouldChangeCount: computed(() => firstPage.value?.wouldChangeCount ?? 0),
        alreadyTargetCount: computed(() => firstPage.value?.alreadyTargetCount ?? 0),
        counts: computed(() => firstPage.value?.counts ?? null),
        fetchNextPage: query.fetchNextPage,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        isLoading: query.isLoading,
        error: query.error,
    };
}
