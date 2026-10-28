import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, reactive, ref, toValue, watch, type EffectScope } from "vue";
import { refDebounced } from "@vueuse/core";

import { useTransactionFilters, type UseTransactionFiltersOptions } from "./useTransactionFilters";
import { useCategoryToggle } from "./useCategoryToggle";
import { endEditRun, writeQuery } from "../../utils/queryHistory";

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
        // As with the real router, the write's navigation settles only once the route has taken its query.
        push.mockImplementationOnce(
            (location: { query: Record<string, unknown> }) =>
                new Promise((resolve) => {
                    deliver = () => {
                        route.query = location.query;
                        resolve(undefined);
                    };
                }),
        );

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

/**
 * A router whose navigations finish later, as vue-router's do. A navigation changes the route and the browser history
 * only when `flush()` finishes it. A new navigation cancels the one still waiting, as vue-router does, so only the last
 * one reaches history: a push adds an entry and a replace swaps the current one.
 */
function deferredRouter() {
    const browser = { history: { state: null as Record<string, unknown> | null } };
    const counts = { pushes: 0, replaces: 0 };
    let waiting: {
        query: Record<string, unknown>;
        kind: "push" | "replace";
        state?: Record<string, unknown>;
        done: () => void;
    } | null = null;

    const navigate =
        (kind: "push" | "replace") => (location: { query: Record<string, unknown>; state?: Record<string, unknown> }) =>
            new Promise<void>((resolve) => {
                waiting?.done();
                waiting = { query: location.query, kind, state: location.state, done: resolve };
            });

    function flush() {
        const nav = waiting;
        if (!nav) return;
        waiting = null;
        route.query = nav.query;
        if (nav.kind === "push") {
            counts.pushes += 1;
            browser.history.state = { ...nav.state };
        } else {
            counts.replaces += 1;
            browser.history.state = { ...browser.history.state, ...nav.state };
        }
        nav.done();
    }

    return { router: { push: navigate("push"), replace: navigate("replace") }, browser, counts, flush };
}

describe("useTransactionFilters writes made in the same task", () => {
    const CATEGORY_IDS = ["a", "b", "c", "d", "e"];
    const CATEGORY_OPTIONS = CATEGORY_IDS.map((value) => ({ value }));
    let nav: ReturnType<typeof deferredRouter>;

    /**
     * A category panel bound the way a parent binds it: the panel's model writes the page's selection, and it reads the
     * selection the parent last rendered, which only catches up on render.
     */
    function mountPanel(filters: ReturnType<typeof useTransactionFilters>) {
        const rendered = ref<string[]>(filters.selectedCategoryIds.value);
        const model = computed<string[]>({
            get: () => rendered.value,
            set: (ids) => {
                filters.selectedCategoryIds.value = ids;
            },
        });
        const toggles = useCategoryToggle(model, CATEGORY_OPTIONS);
        const render = () => {
            rendered.value = filters.selectedCategoryIds.value;
        };
        return { toggles, render };
    }

    beforeEach(() => {
        nav = deferredRouter();
        vi.stubGlobal("useRouter", () => nav.router);
        vi.stubGlobal("window", nav.browser);
        endEditRun();
    });

    it("applies three category selects in one task as one URL and one history entry", async () => {
        const filters = mountFilters({ knownCategoryIds: CATEGORY_IDS });
        const panel = mountPanel(filters);

        panel.toggles.toggle("a");
        panel.toggles.toggle("b");
        panel.toggles.toggle("c");
        nav.flush();
        panel.render();
        await nextTick();

        expect(route.query).toEqual({ categories: "a,b,c" });
        expect(nav.counts).toEqual({ pushes: 1, replaces: 0 });
        expect(panel.toggles.isSelected("c")).toBe(true);
    });

    it("applies three category deselects in one task", async () => {
        route.query = { categories: "a,b,c,d" };
        const filters = mountFilters({ knownCategoryIds: CATEGORY_IDS });
        const panel = mountPanel(filters);

        panel.toggles.toggle("a");
        panel.toggles.toggle("b");
        panel.toggles.toggle("c");
        nav.flush();
        panel.render();
        await nextTick();

        expect(route.query).toEqual({ categories: "d" });
        expect(nav.counts).toEqual({ pushes: 1, replaces: 0 });
    });

    it("keeps a category toggle, a sort change and a period change made in one task", async () => {
        route.query = { create: "expense" };
        const filters = mountFilters({ knownCategoryIds: CATEGORY_IDS });
        const panel = mountPanel(filters);

        panel.toggles.toggle("a");
        filters.sortOption.value = "oldest";
        panel.toggles.toggle("b");
        filters.period.value = { kind: "range", from: "2026-08", to: "2026-08" };
        nav.flush();
        panel.render();
        await nextTick();

        expect(route.query).toEqual({
            create: "expense",
            categories: "a,b",
            sort: "oldest",
            from: "2026-08",
            to: "2026-08",
        });
        expect(nav.counts).toEqual({ pushes: 1, replaces: 0 });
    });

    it("keeps one history entry for a category run whose toggles land in separate tasks", async () => {
        const filters = mountFilters({ knownCategoryIds: CATEGORY_IDS });
        const panel = mountPanel(filters);

        panel.toggles.toggle("a");
        nav.flush();
        panel.render();
        await nextTick();

        panel.toggles.toggle("b");
        nav.flush();
        panel.render();
        await nextTick();

        expect(route.query).toEqual({ categories: "a,b" });
        expect(nav.counts).toEqual({ pushes: 1, replaces: 1 });
    });
});
