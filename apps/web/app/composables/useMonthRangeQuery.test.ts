import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, type EffectScope } from "vue";

import { useMonthRangeQuery } from "./useMonthRangeQuery";

// Nuxt auto-imports (useRoute, useRouter) are globals here, so each test stubs them. `replace` mirrors the router by
// writing the new query back to the route, which is what makes the getter react to a change.
const route = reactive<{ query: Record<string, unknown> }>({ query: {} });
const replace = vi.fn((location: { query: Record<string, unknown> }) => {
    route.query = location.query;
});
const push = vi.fn((location: { query: Record<string, unknown> }) => {
    route.query = location.query;
});

let scopes: EffectScope[] = [];

/** Runs `useMonthRangeQuery` in its own scope, as a component's setup would. */
const mountRange = (allowAll: boolean) => {
    const scope = effectScope();
    scopes.push(scope);
    return scope.run(() => useMonthRangeQuery({ allowAll }))!;
};

beforeEach(() => {
    route.query = {};
    replace.mockClear();
    push.mockClear();
    vi.stubGlobal("useRoute", () => route);
    vi.stubGlobal("useRouter", () => ({ replace, push }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 26));
});

afterEach(() => {
    scopes.forEach((scope) => scope.stop());
    scopes = [];
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("useMonthRangeQuery", () => {
    it("reads an empty query as the current month without writing the URL", () => {
        const { selection } = mountRange(true);

        expect(selection.value).toEqual({ kind: "range", from: "2026-10", to: "2026-10" });
        expect(replace).not.toHaveBeenCalled();
    });

    it("reads a valid from/to query as that range", () => {
        route.query = { from: "2026-07", to: "2026-09" };
        const { selection } = mountRange(true);

        expect(selection.value).toEqual({ kind: "range", from: "2026-07", to: "2026-09" });
    });

    it("reads an invalid query as the current month without writing the URL", () => {
        route.query = { from: "2026-13" };
        const { selection } = mountRange(true);

        expect(selection.value).toEqual({ kind: "range", from: "2026-10", to: "2026-10" });
        expect(replace).not.toHaveBeenCalled();
    });

    it("writes a set range with replace, keeping unrelated query keys", () => {
        route.query = { create: "expense" };
        const { selection } = mountRange(true);

        selection.value = { kind: "range", from: "2026-08", to: "2026-09" };

        expect(replace).toHaveBeenCalledTimes(1);
        expect(replace).toHaveBeenCalledWith({
            query: { create: "expense", from: "2026-08", to: "2026-09" },
        });
        expect(selection.value).toEqual({ kind: "range", from: "2026-08", to: "2026-09" });
    });

    it("writes all time as from=all and drops to", () => {
        route.query = { from: "2026-08", to: "2026-09", create: "expense" };
        const { selection } = mountRange(true);

        selection.value = { kind: "all" };

        expect(replace).toHaveBeenCalledWith({ query: { create: "expense", from: "all" } });
        expect(route.query).not.toHaveProperty("to");
        expect(selection.value).toEqual({ kind: "all" });
    });

    it("reads from=all as the current month when allowAll is false", () => {
        route.query = { from: "all" };
        const { selection } = mountRange(false);

        expect(selection.value).toEqual({ kind: "range", from: "2026-10", to: "2026-10" });
        expect(replace).not.toHaveBeenCalled();
    });

    it("reacts when the route query changes, as on back or forward", async () => {
        const { selection } = mountRange(true);
        expect(selection.value).toEqual({ kind: "range", from: "2026-10", to: "2026-10" });

        route.query = { from: "2026-01", to: "2026-03" };
        await nextTick();

        expect(selection.value).toEqual({ kind: "range", from: "2026-01", to: "2026-03" });
    });

    it("writes with push, keeping unrelated query keys, when historyMode is push", () => {
        route.query = { create: "expense", sort: "oldest" };
        const scope = effectScope();
        scopes.push(scope);
        const { selection } = scope.run(() => useMonthRangeQuery({ allowAll: true, historyMode: "push" }))!;

        selection.value = { kind: "range", from: "2026-08", to: "2026-09" };

        expect(push).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith({
            query: { create: "expense", sort: "oldest", from: "2026-08", to: "2026-09" },
        });
        expect(replace).not.toHaveBeenCalled();
    });
});
