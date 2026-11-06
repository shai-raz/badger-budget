import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { useNuxtApp } from "#app";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import type { Router } from "vue-router";
import TransactionsPage from "./index.vue";
import TransactionsListRows from "../../components/transactions/ListRows.vue";

// The infinite list's query state, driven by each test the way TanStack would: a new key shows the previous rows as
// placeholder data while it fetches, and a key already in the cache is served with no fetch at all.
const list = await vi.hoisted(async () => {
    const { ref: vueRef } = await import("vue");
    return {
        data: vueRef<unknown>(undefined),
        isLoading: vueRef(false),
        isFetching: vueRef(false),
        isFetchingNextPage: vueRef(false),
        isPlaceholderData: vueRef(false),
    };
});

// Only the list query is faked. Summary, facets and the source lists resolve to empty results.
vi.mock("../../composables/transactions/useTransactions", async (importOriginal) => {
    const { ref: vueRef } = await import("vue");
    const actual = await importOriginal<typeof import("../../composables/transactions/useTransactions")>();
    const empty = () => ({ data: vueRef(undefined), isPending: vueRef(false), isError: vueRef(false) });
    return {
        ...actual,
        useInfiniteTransactions: () => ({
            data: list.data,
            error: vueRef(null),
            isLoading: list.isLoading,
            isFetching: list.isFetching,
            isFetchingNextPage: list.isFetchingNextPage,
            isPlaceholderData: list.isPlaceholderData,
            hasNextPage: vueRef(false),
            fetchNextPage: vi.fn(),
        }),
        useTransactionsSummary: () => ({ data: vueRef(undefined), isLoading: vueRef(false) }),
        useTransactionCategoryFacets: empty,
        useTransactionAccountFacets: empty,
        useTransactionTypeFacets: empty,
    };
});
vi.mock("../../composables/categories/useGetCategories.query", async () => {
    const { ref: vueRef } = await import("vue");
    return { useGetCategoriesQuery: () => ({ data: vueRef([]), isPending: vueRef(false) }) };
});
vi.mock("../../composables/accounts/useAccounts", async (importOriginal) => {
    const { ref: vueRef } = await import("vue");
    const actual = await importOriginal<typeof import("../../composables/accounts/useAccounts")>();
    return {
        ...actual,
        useGetAccounts: () => ({ data: vueRef([]), isPending: vueRef(false) }),
    };
});

const mountPage = () =>
    mountSuspended(TransactionsPage, {
        global: {
            stubs: {
                LayoutPageHeader: true,
                LayoutHeaderSync: true,
                TransactionsMetricsStrip: true,
                TransactionsToolbar: true,
                TransactionsFiltersSheet: true,
                TransactionsSortMenu: true,
                CreateTransactionDialog: true,
            },
        },
    });

// The list is the one component the page hands the fade to, so its refetching prop is what the user sees.
const isListFaded = (wrapper: VueWrapper) => wrapper.findComponent(TransactionsListRows).props("refetching");

const mounted: VueWrapper[] = [];
let router: Router;

beforeEach(async () => {
    router = useNuxtApp().$router;
    list.data.value = { pages: [{ data: [], page: 1, totalPages: 1, total: 0 }] };
    list.isLoading.value = false;
    list.isFetching.value = false;
    list.isFetchingNextPage.value = false;
    list.isPlaceholderData.value = false;
    // Start each test from the same URL so the list params begin unchanged.
    await router.replace({ query: {} });
});

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("transactions list fade", () => {
    it("fades while a new key's fetch shows the previous rows as placeholder data", async () => {
        const wrapper = await mountPage();
        mounted.push(wrapper);
        await flushPromises();

        await router.push({ query: { sort: "name" } });
        list.isPlaceholderData.value = true;
        await flushPromises();

        expect(isListFaded(wrapper)).toBe(true);
    });

    it("clears the fade once the new key's data replaces the placeholder", async () => {
        const wrapper = await mountPage();
        mounted.push(wrapper);
        await flushPromises();

        await router.push({ query: { sort: "name" } });
        list.isPlaceholderData.value = true;
        await flushPromises();
        list.isPlaceholderData.value = false;
        await flushPromises();

        expect(isListFaded(wrapper)).toBe(false);
    });

    it("does not leave the list faded when a cached key is served with no fetch", async () => {
        const wrapper = await mountPage();
        mounted.push(wrapper);
        await flushPromises();

        // The cached key's rows come straight from the cache: nothing is fetching and no placeholder is shown.
        await router.push({ query: { sort: "name" } });
        await flushPromises();

        expect(isListFaded(wrapper)).toBe(false);
    });

    it("does not fade for a same-key refetch, such as a mutation's invalidation", async () => {
        const wrapper = await mountPage();
        mounted.push(wrapper);
        await flushPromises();

        list.isFetching.value = true;
        await flushPromises();

        expect(isListFaded(wrapper)).toBe(false);
    });
});
