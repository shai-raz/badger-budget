import type { IRule } from "@badger/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDeleteRuleMutation, useReorderRulesMutation, useSetRuleActiveMutation } from "./useRules";

interface MutationOptions<V> {
    mutationFn: (variables: V) => Promise<unknown>;
    onMutate?: (variables: V) => Promise<{ previous?: IRule[] }>;
    onError?: (error: unknown, variables: V, context?: { previous?: IRule[] }) => void;
    onSettled?: () => void;
}

const invalidateQueries = vi.fn();
const cancelQueries = vi.fn(async () => undefined);
let cache: IRule[] = [];
let captured: unknown[] = [];

const queryClient = {
    invalidateQueries,
    cancelQueries,
    getQueryData: vi.fn(() => cache),
    setQueryData: vi.fn((_key: unknown, updater: IRule[] | ((old: IRule[]) => IRule[])) => {
        cache = typeof updater === "function" ? updater(cache) : updater;
    }),
};

const apiClient = {
    setRuleActive: vi.fn(async () => ({})),
    reorderRules: vi.fn(async () => undefined),
    deleteRule: vi.fn(async () => undefined),
};

vi.mock("@tanstack/vue-query", () => ({
    useQueryClient: () => queryClient,
    useMutation: (options: unknown) => {
        captured.push(options);
        return {};
    },
}));

const ruleFixture = (id: string, priority: number, isActive = true): IRule => ({
    id,
    name: `Rule ${id}`,
    priority,
    stopOnMatch: true,
    isActive,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    conditions: [],
    actions: [],
});

/** Builds a mutation and returns its options, as the wrapped `useMutation` receives them. */
function optionsFor<V>(build: () => unknown): MutationOptions<V> {
    captured = [];
    build();
    return captured[0] as MutationOptions<V>;
}

const listKey = ["rules", "list"];
const invalidatedKeys = () => invalidateQueries.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);

beforeEach(() => {
    vi.clearAllMocks();
    cache = [ruleFixture("r1", 1), ruleFixture("r2", 2), ruleFixture("r3", 3)];
    vi.stubGlobal("useApiClient", () => apiClient);
});

describe("useSetRuleActiveMutation", () => {
    it("patches isActive in the cache before the request settles", async () => {
        const options = optionsFor<{ id: string; isActive: boolean }>(useSetRuleActiveMutation);
        await options.onMutate?.({ id: "r2", isActive: false });
        expect(cache.find((rule) => rule.id === "r2")?.isActive).toBe(false);
        expect(cache.find((rule) => rule.id === "r1")?.isActive).toBe(true);
    });

    it("restores the snapshot when the request fails", async () => {
        const options = optionsFor<{ id: string; isActive: boolean }>(useSetRuleActiveMutation);
        const context = await options.onMutate?.({ id: "r2", isActive: false });
        options.onError?.(new Error("boom"), { id: "r2", isActive: false }, context);
        expect(cache.find((rule) => rule.id === "r2")?.isActive).toBe(true);
    });

    it("invalidates the rule lists once settled", () => {
        const options = optionsFor<{ id: string; isActive: boolean }>(useSetRuleActiveMutation);
        options.onSettled?.();
        expect(invalidatedKeys()).toEqual([listKey]);
    });
});

describe("useReorderRulesMutation", () => {
    it("reorders the cache by the ids with priorities 1..n", async () => {
        const options = optionsFor<string[]>(useReorderRulesMutation);
        await options.onMutate?.(["r3", "r1", "r2"]);
        expect(cache.map((rule) => [rule.id, rule.priority])).toEqual([
            ["r3", 1],
            ["r1", 2],
            ["r2", 3],
        ]);
    });

    it("keeps rules that the id list leaves out, after the listed ones", async () => {
        const options = optionsFor<string[]>(useReorderRulesMutation);
        await options.onMutate?.(["r2", "r1"]);
        expect(cache.map((rule) => rule.id)).toEqual(["r2", "r1", "r3"]);
        expect(cache.map((rule) => rule.priority)).toEqual([1, 2, 3]);
    });

    it("restores the previous order when the request fails", async () => {
        const options = optionsFor<string[]>(useReorderRulesMutation);
        const context = await options.onMutate?.(["r3", "r2", "r1"]);
        options.onError?.(new Error("boom"), ["r3", "r2", "r1"], context);
        expect(cache.map((rule) => rule.id)).toEqual(["r1", "r2", "r3"]);
    });

    it("refetches the lists when the server reports a conflict", () => {
        const options = optionsFor<string[]>(useReorderRulesMutation);
        options.onError?.({ response: { status: 409 } }, ["r3", "r2", "r1"], { previous: cache });
        expect(invalidatedKeys()).toEqual([listKey]);
    });

    it("does not refetch on other failures", () => {
        const options = optionsFor<string[]>(useReorderRulesMutation);
        options.onError?.({ response: { status: 500 } }, ["r3", "r2", "r1"], { previous: cache });
        expect(invalidatedKeys()).toEqual([]);
    });

    it("sends the ids to the API", async () => {
        const options = optionsFor<string[]>(useReorderRulesMutation);
        await options.mutationFn(["r2", "r1", "r3"]);
        expect(apiClient.reorderRules).toHaveBeenCalledWith(["r2", "r1", "r3"]);
    });
});

describe("useDeleteRuleMutation", () => {
    it("deletes the rule and invalidates the lists once settled", async () => {
        const options = optionsFor<string>(useDeleteRuleMutation);
        await options.mutationFn("r1");
        options.onSettled?.();
        expect(apiClient.deleteRule).toHaveBeenCalledWith("r1");
        expect(invalidatedKeys()).toEqual([listKey]);
    });
});
