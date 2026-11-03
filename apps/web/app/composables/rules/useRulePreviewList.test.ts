import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref, type Ref } from "vue";
import type { RulePreviewFilter } from "@badger/shared-data";
import type { RuleDraft, RulePreviewItem, RulePreviewResponse } from "@badger/types";
import { ruleKeys } from "./ruleKeys";
import { useRulePreviewList } from "./useRulePreviewList";

interface InfiniteOptions {
    queryKey: Ref<unknown[]>;
    enabled: Ref<boolean>;
    queryFn: (ctx: { pageParam: number }) => Promise<unknown>;
    getNextPageParam: (last: RulePreviewResponse) => number | undefined;
}

let options: InfiniteOptions;
let data: Ref<{ pages: RulePreviewResponse[] } | undefined>;
const previewRule = vi.fn(async () => page());

vi.mock("@tanstack/vue-query", () => ({
    useInfiniteQuery: (opts: InfiniteOptions) => {
        options = opts;
        return {
            data,
            fetchNextPage: vi.fn(),
            hasNextPage: ref(false),
            isFetchingNextPage: ref(false),
            isLoading: ref(false),
            error: ref(null),
        };
    },
    keepPreviousData: "keep-previous",
}));

vi.mock("../useApiClient", () => ({
    useApiClient: () => ({ previewRule }),
}));

const draft: RuleDraft = {
    conditions: [{ field: "description", operator: "contains", value: "starbucks" }],
    actions: [{ type: "set_category", value: "cat-coffee" }],
};

const page = (over: Partial<RulePreviewResponse> = {}): RulePreviewResponse => ({
    matchCount: 3,
    wouldChangeCount: 2,
    alreadyTargetCount: 1,
    counts: { all: 3, uncategorized: 2, categorized: 1 },
    items: [],
    page: 1,
    totalPages: 1,
    ...over,
});

const item = (id: string): RulePreviewItem => ({
    id,
    description: `row ${id}`,
    transactionDate: "2026-10-01",
    amount: -4.5,
    type: "expense",
    currencyCode: "USD",
    accountName: null,
    category: null,
});

const keyFor = (filter: RulePreviewFilter, search: string) => ruleKeys.preview({ ...draft, filter, search });

beforeEach(() => {
    vi.useFakeTimers();
    data = ref(undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

/** Lets Vue run its queued watchers, so the debounce timer starts. */
async function flush() {
    await nextTick();
}

describe("useRulePreviewList", () => {
    it("does not request while there is no draft", () => {
        useRulePreviewList(ref<RuleDraft | null>(null), ref<RulePreviewFilter>("all"), ref(""));
        expect(options.enabled.value).toBe(false);
    });

    it("keys the list by draft, filter and search, never by page", () => {
        useRulePreviewList(ref<RuleDraft | null>(draft), ref<RulePreviewFilter>("uncategorized"), ref("  "));
        expect(options.queryKey.value).toEqual(keyFor("uncategorized", ""));
    });

    it("requests the page the query asks for with the same filter and search", async () => {
        useRulePreviewList(ref<RuleDraft | null>(draft), ref<RulePreviewFilter>("all"), ref(""));
        await options.queryFn({ pageParam: 3 });
        expect(previewRule).toHaveBeenCalledWith({ ...draft, filter: "all", search: "", page: 3 });
    });

    it("moves to the next page only while more pages remain", () => {
        useRulePreviewList(ref<RuleDraft | null>(draft), ref<RulePreviewFilter>("all"), ref(""));
        expect(options.getNextPageParam(page({ page: 1, totalPages: 3 }))).toBe(2);
        expect(options.getNextPageParam(page({ page: 3, totalPages: 3 }))).toBeUndefined();
    });

    it("debounces a typed search by 300ms", async () => {
        const search = ref("");
        useRulePreviewList(ref<RuleDraft | null>(draft), ref<RulePreviewFilter>("all"), search);

        search.value = "star";
        await flush();
        vi.advanceTimersByTime(299);
        expect(options.queryKey.value).toEqual(keyFor("all", ""));

        vi.advanceTimersByTime(1);
        expect(options.queryKey.value).toEqual(keyFor("all", "star"));
    });

    it("applies an emptied search at once, without waiting out the debounce", async () => {
        const search = ref("star");
        useRulePreviewList(ref<RuleDraft | null>(draft), ref<RulePreviewFilter>("all"), search);
        vi.advanceTimersByTime(300);
        expect(options.queryKey.value).toEqual(keyFor("all", "star"));

        search.value = "";
        await flush();
        expect(options.queryKey.value).toEqual(keyFor("all", ""));
    });

    it("flattens the loaded pages and takes the totals from the first page", () => {
        data.value = {
            pages: [
                page({ items: [item("a")], page: 1, totalPages: 2, wouldChangeCount: 7, alreadyTargetCount: 2 }),
                page({ items: [item("b")], page: 2, totalPages: 2, wouldChangeCount: 99, alreadyTargetCount: 99 }),
            ],
        };
        const list = useRulePreviewList(ref<RuleDraft | null>(draft), ref<RulePreviewFilter>("all"), ref(""));

        expect(list.items.value.map((row) => row.id)).toEqual(["a", "b"]);
        expect(list.wouldChangeCount.value).toBe(7);
        expect(list.alreadyTargetCount.value).toBe(2);
        expect(list.counts.value).toEqual({ all: 3, uncategorized: 2, categorized: 1 });
    });

    it("has no rows or totals before the first page arrives", () => {
        const list = useRulePreviewList(ref<RuleDraft | null>(draft), ref<RulePreviewFilter>("all"), ref(""));
        expect(list.items.value).toEqual([]);
        expect(list.wouldChangeCount.value).toBe(0);
        expect(list.counts.value).toBeNull();
    });
});
