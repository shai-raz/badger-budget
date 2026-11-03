import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref, type Ref } from "vue";

import { emptyDraft, newCondition, type RuleEditorDraft } from "../../utils/ruleEditor";
import { useRulePreviewCount } from "./useRulePreview";

interface QueryOptions {
    queryKey: Ref<unknown[]>;
    enabled: Ref<boolean>;
    queryFn: () => Promise<unknown>;
    staleTime: number;
    placeholderData: unknown;
}

let queryOptions: QueryOptions;
const previewRule = vi.fn(async () => ({
    matchCount: 2,
    wouldChangeCount: 1,
    alreadyTargetCount: 1,
    counts: {},
    items: [],
    page: 1,
    totalPages: 1,
}));

vi.mock("@tanstack/vue-query", () => ({
    useQuery: (opts: QueryOptions) => {
        queryOptions = opts;
        return { data: ref(undefined), isFetching: ref(false) };
    },
    keepPreviousData: "keep-previous",
}));

const completeDraft = (): RuleEditorDraft => ({
    ...emptyDraft(),
    conditions: [{ ...newCondition("description"), value: "starbucks" }],
    categoryId: "cat-coffee",
});

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("useApiClient", () => ({ previewRule }));
});

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

/** Lets Vue run its queued watchers, so the debounce timer starts. */
async function flush() {
    await nextTick();
}

describe("useRulePreviewCount", () => {
    it("does not request a preview while the draft is incomplete", async () => {
        const draft = ref<RuleEditorDraft>(emptyDraft());
        useRulePreviewCount(draft);
        vi.advanceTimersByTime(1000);
        await flush();
        expect(queryOptions.enabled.value).toBe(false);
    });

    it("waits 400ms of stillness before requesting the preview", async () => {
        const draft = ref<RuleEditorDraft>(emptyDraft());
        useRulePreviewCount(draft);
        draft.value = completeDraft();
        await flush();

        vi.advanceTimersByTime(399);
        expect(queryOptions.enabled.value).toBe(false);

        vi.advanceTimersByTime(1);
        expect(queryOptions.enabled.value).toBe(true);
    });

    it("keys the request on the trimmed draft and the first page of all rows", async () => {
        const draft = ref<RuleEditorDraft>({
            ...completeDraft(),
            conditions: [{ ...newCondition("description"), value: "  starbucks  " }],
        });
        useRulePreviewCount(draft);
        await flush();
        vi.advanceTimersByTime(400);

        expect(queryOptions.queryKey.value).toEqual([
            "rules",
            "preview",
            {
                conditions: [{ field: "description", operator: "contains", value: "starbucks" }],
                actions: [{ type: "set_category", value: "cat-coffee" }],
                page: 1,
                filter: "all",
            },
        ]);
    });

    it("never trusts a cached count, since transactions change outside the editor", () => {
        useRulePreviewCount(ref(completeDraft()));
        expect(queryOptions.staleTime).toBe(0);
    });

    it("keeps the previous count while a new one loads", () => {
        useRulePreviewCount(ref(completeDraft()));
        expect(queryOptions.placeholderData).toBe("keep-previous");
    });

    it("fetches the preview for the settled draft", async () => {
        const draft = ref<RuleEditorDraft>(completeDraft());
        useRulePreviewCount(draft);
        await flush();
        vi.advanceTimersByTime(400);

        await queryOptions.queryFn();
        expect(previewRule).toHaveBeenCalledWith(
            expect.objectContaining({
                page: 1,
                filter: "all",
                actions: [{ type: "set_category", value: "cat-coffee" }],
            }),
        );
    });
});
