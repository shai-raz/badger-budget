import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, reactive, ref, toValue, watch, type EffectScope } from "vue";
import { refDebounced } from "@vueuse/core";

import { useTransactionFilters, type UseTransactionFiltersOptions } from "./useTransactionFilters";
import { writeQuery } from "../../utils/queryHistory";

// Spy on the real writer, so each test can assert which QueryWrite kind a control chose.
vi.mock("../../utils/queryHistory", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../utils/queryHistory")>();
    return { ...actual, writeQuery: vi.fn(actual.writeQuery) };
});

// Nuxt auto-imports (useRoute, useRouter, computed, ref, ...) are globals here. `replace` and `push` mirror the router
// by writing the new query back to the route, which is what makes the composable's getters react to a write.
const route = reactive<{ query: Record<string, unknown> }>({ query: {} });
const replace = vi.fn((location: { query: Record<string, unknown> }) => {
    route.query = location.query;
    return Promise.resolve(undefined);
});
const push = vi.fn((location: { query: Record<string, unknown> }) => {
    route.query = location.query;
    return Promise.resolve(undefined);
});
const router = { push, replace };

let scopes: EffectScope[] = [];

/** Runs `useTransactionFilters` in its own scope, as a component's setup would. */
const mountFilters = (options: UseTransactionFiltersOptions = {}) => {
    const scope = effectScope();
    scopes.push(scope);
    return scope.run(() => useTransactionFilters(options))!;
};

/** Runs past the 300 ms search debounce, then lets the watchers it wakes run. */
async function passDebounce() {
    await nextTick();
    vi.advanceTimersByTime(300);
    await nextTick();
}

beforeEach(() => {
    route.query = {};
    push.mockClear();
    replace.mockClear();
    vi.mocked(writeQuery).mockClear();
    vi.stubGlobal("useRoute", () => route);
    vi.stubGlobal("useRouter", () => router);
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("watch", watch);
    vi.stubGlobal("toValue", toValue);
    vi.stubGlobal("refDebounced", refDebounced);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26));
});

afterEach(() => {
    scopes.forEach((scope) => scope.stop());
    scopes = [];
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("useTransactionFilters categories", () => {
    it("keeps every requested id while the known categories are still loading", () => {
        route.query = { categories: "a,zzz" };
        const known = ref<string[] | undefined>(undefined);
        const { selectedCategoryIds } = mountFilters({ knownCategoryIds: known });

        expect(selectedCategoryIds.value).toEqual(["a", "zzz"]);
    });

    it("drops ids the user no longer has once the categories load", () => {
        route.query = { categories: "a,zzz" };
        const known = ref<string[] | undefined>(undefined);
        const { selectedCategoryIds } = mountFilters({ knownCategoryIds: known });

        known.value = ["a", "b"];

        expect(selectedCategoryIds.value).toEqual(["a"]);
    });

    it("reads a selection of every known category as none, and sends no category param", () => {
        route.query = { categories: "a,b" };
        const known = ref<string[] | undefined>(["a", "b"]);
        const { selectedCategoryIds, listParams } = mountFilters({ knownCategoryIds: known });

        expect(selectedCategoryIds.value).toEqual([]);
        expect(listParams.value).not.toHaveProperty("categoryIds");
    });

    it("writes a category selection as an edit, keeping create and from", () => {
        route.query = { create: "expense", from: "2026-08" };
        const { selectedCategoryIds } = mountFilters();

        selectedCategoryIds.value = ["a"];

        expect(writeQuery).toHaveBeenCalledWith(
            router,
            { create: "expense", from: "2026-08", categories: "a" },
            { kind: "edit", control: "categories" },
        );
    });
});

describe("useTransactionFilters search", () => {
    it("takes an external change to the search from the URL into the input, and does not write it back", async () => {
        const { searchQuery } = mountFilters();

        // A Back navigation or a pasted link changes the URL under the page.
        route.query = { q: "rent" };
        await nextTick();
        expect(searchQuery.value).toBe("rent");

        await passDebounce();
        expect(writeQuery).not.toHaveBeenCalled();
    });

    it("drops a pending typed value when an external change lands first, and does not write after the debounce", async () => {
        const { searchQuery } = mountFilters();

        searchQuery.value = "re";
        await nextTick();
        vi.advanceTimersByTime(100);
        route.query = { q: "old" };
        await nextTick();
        expect(searchQuery.value).toBe("old");

        await passDebounce();

        expect(writeQuery).not.toHaveBeenCalled();
        expect(searchQuery.value).toBe("old");
    });

    it("writes a typed search once after the debounce, trimmed, and does not rewrite its own echo", async () => {
        const { searchQuery } = mountFilters();

        searchQuery.value = "  rent  ";
        await nextTick();
        vi.advanceTimersByTime(299);
        await nextTick();
        expect(writeQuery).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        await nextTick();

        expect(writeQuery).toHaveBeenCalledTimes(1);
        expect(writeQuery).toHaveBeenCalledWith(router, { q: "rent" }, { kind: "edit", control: "search" });
        expect(route.query).toEqual({ q: "rent" });

        await passDebounce();
        expect(writeQuery).toHaveBeenCalledTimes(1);
    });

    it("does not let its own write's echo overwrite text typed after that write", async () => {
        const { searchQuery } = mountFilters();
        // The router applies this write later, as a real navigation does, so the echo arrives after more typing.
        let deliver: () => void = () => undefined;
        push.mockImplementationOnce((location: { query: Record<string, unknown> }) => {
            deliver = () => {
                route.query = location.query;
            };
            return Promise.resolve(undefined);
        });

        searchQuery.value = "rent";
        await passDebounce();
        expect(push).toHaveBeenCalledTimes(1);

        searchQuery.value = "rento";
        await nextTick();
        deliver();
        await nextTick();

        expect(searchQuery.value).toBe("rento");

        await passDebounce();
        expect(writeQuery).toHaveBeenLastCalledWith(router, { q: "rento" }, { kind: "edit", control: "search" });
    });

    it("clears the search through its chip as one push, and the debounce adds no second write", async () => {
        route.query = { q: "rent" };
        const { activeChips, searchQuery } = mountFilters();

        activeChips.value.find((chip) => chip.key === "search")!.clear();

        expect(searchQuery.value).toBe("");
        expect(writeQuery).toHaveBeenCalledTimes(1);
        expect(writeQuery).toHaveBeenLastCalledWith(router, {}, { kind: "push" });
        expect(route.query).toEqual({});

        await passDebounce();
        expect(writeQuery).toHaveBeenCalledTimes(1);
    });
});

describe("useTransactionFilters filter writes", () => {
    it("pushes a type change, keeping create and from", () => {
        route.query = { create: "expense", from: "2026-08" };
        const { typeFilter } = mountFilters();

        typeFilter.value = "expense";

        expect(writeQuery).toHaveBeenCalledWith(
            router,
            { create: "expense", from: "2026-08", type: "expense" },
            { kind: "push" },
        );
        expect(push).toHaveBeenCalledTimes(1);
    });

    it("pushes a sort change, keeping create and from", () => {
        route.query = { create: "expense", from: "2026-08" };
        const { sortOption } = mountFilters();

        sortOption.value = "oldest";

        expect(writeQuery).toHaveBeenCalledWith(
            router,
            { create: "expense", from: "2026-08", sort: "oldest" },
            { kind: "push" },
        );
    });

    it("pushes showing hidden, keeping create and from", () => {
        route.query = { create: "expense", from: "2026-08" };
        const { showHidden } = mountFilters();

        showHidden.value = true;

        expect(writeQuery).toHaveBeenCalledWith(
            router,
            { create: "expense", from: "2026-08", hidden: "1" },
            { kind: "push" },
        );
    });

    it("writes nothing when a filter is set to the value it already has", () => {
        const { showHidden } = mountFilters();

        showHidden.value = false;

        expect(writeQuery).not.toHaveBeenCalled();
    });

    it("pushes a type chip clear, keeping create", () => {
        route.query = { type: "income", create: "expense" };
        const { activeChips } = mountFilters();

        activeChips.value.find((chip) => chip.key === "type")!.clear();

        expect(writeQuery).toHaveBeenLastCalledWith(router, { create: "expense" }, { kind: "push" });
    });

    it("clearAllFilters resets type, categories and hidden, and keeps search, sort, period and create", () => {
        route.query = {
            type: "income",
            categories: "a",
            hidden: "1",
            q: "rent",
            sort: "oldest",
            create: "expense",
            from: "2026-08",
        };
        const { clearAllFilters } = mountFilters();

        clearAllFilters();

        expect(writeQuery).toHaveBeenLastCalledWith(
            router,
            { q: "rent", sort: "oldest", create: "expense", from: "2026-08" },
            { kind: "push" },
        );
        expect(route.query).toEqual({ q: "rent", sort: "oldest", create: "expense", from: "2026-08" });
    });
});
