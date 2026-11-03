import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import { refDebounced } from "@vueuse/core";
import type { RulePreviewRequest, RulePreviewResponse } from "@badger/types";
import { computed, type Ref } from "vue";
import { isDraftComplete, toRuleDraft, type RuleEditorDraft } from "../../utils/ruleEditor";
import { ruleKeys } from "./ruleKeys";

/** How long the draft must stay unchanged before the preview is requested. */
const PREVIEW_DEBOUNCE_MS = 400;

/**
 * Counts the transactions the draft would match, for the editor's "Also apply" box. Nothing is requested
 * until the draft is complete, and the request waits until typing has paused. `checking` is true while the
 * count on screen may be out of date; `keepPreviousData` keeps the last count visible meanwhile.
 */
export function useRulePreviewCount(draft: Ref<RuleEditorDraft>) {
    const apiClient = useApiClient();

    // Equal drafts produce equal query keys, so a settled draft that changes back and forth never refetches.
    const params = computed(() => (isDraftComplete(draft.value) ? toRuleDraft(draft.value) : null));
    const settled = refDebounced(params, PREVIEW_DEBOUNCE_MS);

    const request = computed<RulePreviewRequest | null>(() =>
        settled.value === null ? null : { ...settled.value, page: 1, filter: "all" },
    );

    const query = useQuery({
        queryKey: computed(() => (request.value ? ruleKeys.preview(request.value) : ruleKeys.previews())),
        queryFn: async () => {
            const req = request.value;
            if (!req) throw new Error("A preview needs a complete draft");
            return apiClient.previewRule(req);
        },
        enabled: computed(() => request.value !== null),
        // Transactions change outside this editor (edits, imports, syncs), so every open counts again.
        staleTime: 0,
        placeholderData: keepPreviousData,
    });

    const preview = computed<RulePreviewResponse | null>(() => query.data.value ?? null);
    // Compared by value: `refDebounced` holds its value in a reactive ref, so the settled object is a proxy and
    // never `===` the computed one. A name edit leaves the request unchanged, so it does not count as checking.
    const checking = computed(
        () =>
            params.value !== null &&
            (JSON.stringify(settled.value) !== JSON.stringify(params.value) || query.isFetching.value),
    );

    return { preview, checking };
}
