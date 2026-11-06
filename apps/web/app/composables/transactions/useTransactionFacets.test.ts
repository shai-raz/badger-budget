import type { ITransactionAccountFacetParams, ITransactionTypeFacetParams } from "@badger/types";
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { transactionKeys, useTransactionAccountFacets, useTransactionTypeFacets } from "./useTransactions";

type CapturedQuery = {
    queryKey: { value: unknown[] };
    queryFn: () => unknown;
    placeholderData: unknown;
};
const { KEEP_PREVIOUS, captured } = vi.hoisted(() => ({
    KEEP_PREVIOUS: Symbol("keepPreviousData"),
    captured: [] as CapturedQuery[],
}));

vi.mock("@tanstack/vue-query", () => ({
    useQuery: (options: CapturedQuery) => {
        captured.push(options);
        return {};
    },
    useInfiniteQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: vi.fn(),
    keepPreviousData: KEEP_PREVIOUS,
}));

const apiClient = {
    getTransactionAccountFacets: vi.fn(async () => ({ accounts: [] })),
    getTransactionTypeFacets: vi.fn(async () => ({ types: [] })),
};
vi.mock("../useApiClient", () => ({ useApiClient: () => apiClient }));

const firstQuery = (): CapturedQuery => {
    const query = captured[0];
    if (!query) throw new Error("useQuery was not called");
    return query;
};

beforeEach(() => {
    vi.clearAllMocks();
    captured.length = 0;
    // Nuxt auto-imports used by the composables file.
    vi.stubGlobal("computed", computed);
});

describe("transaction facet keys", () => {
    it("account and type facet keys live under the transactions root, so invalidating it refreshes them", () => {
        expect(transactionKeys.accountFacets({ search: "rent" }).slice(0, 1)).toEqual(transactionKeys.all);
        expect(transactionKeys.typeFacets({ search: "rent" }).slice(0, 1)).toEqual(transactionKeys.all);
    });

    it("keys differ per facet and per params", () => {
        const account = transactionKeys.accountFacets({ types: ["expense"] });
        expect(transactionKeys.typeFacets({ accountIds: ["a1"] })).not.toEqual(account);
        expect(transactionKeys.accountFacets({ types: ["income"] })).not.toEqual(account);
    });
});

describe("useTransactionAccountFacets", () => {
    it("queries the account facets endpoint with the current params and keeps previous data", async () => {
        const params = ref<ITransactionAccountFacetParams>({ types: ["expense"] });
        useTransactionAccountFacets(params);

        const query = firstQuery();
        expect(query.placeholderData).toBe(KEEP_PREVIOUS);
        expect(query.queryKey.value).toEqual(transactionKeys.accountFacets({ types: ["expense"] }));

        await query.queryFn();
        expect(apiClient.getTransactionAccountFacets).toHaveBeenCalledWith({ types: ["expense"] });
    });

    it("re-keys when the params change", () => {
        const params = ref<ITransactionAccountFacetParams>({ types: ["expense"] });
        useTransactionAccountFacets(params);

        params.value = { types: ["income"] };
        expect(firstQuery().queryKey.value).toEqual(transactionKeys.accountFacets({ types: ["income"] }));
    });
});

describe("useTransactionTypeFacets", () => {
    it("queries the type facets endpoint with the current params and keeps previous data", async () => {
        const params = ref<ITransactionTypeFacetParams>({ accountIds: ["a1"] });
        useTransactionTypeFacets(params);

        const query = firstQuery();
        expect(query.placeholderData).toBe(KEEP_PREVIOUS);
        expect(query.queryKey.value).toEqual(transactionKeys.typeFacets({ accountIds: ["a1"] }));

        await query.queryFn();
        expect(apiClient.getTransactionTypeFacets).toHaveBeenCalledWith({ accountIds: ["a1"] });
    });

    it("re-keys when the params change", () => {
        const params = ref<ITransactionTypeFacetParams>({ accountIds: ["a1"] });
        useTransactionTypeFacets(params);

        params.value = { accountIds: ["a2"] };
        expect(firstQuery().queryKey.value).toEqual(transactionKeys.typeFacets({ accountIds: ["a2"] }));
    });
});
