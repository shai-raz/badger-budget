import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUpdateCategoryMutation } from "./useUpdateCategory.mutation";

type CachedCategory = { id: string; name: string; color: string; icon?: string };

interface MutationOptions {
    onMutate: (vars: { id: string; data: Record<string, unknown> }) => Promise<unknown>;
    onSettled: () => void;
}

const invalidateQueries = vi.fn();
let categories: CachedCategory[] = [];
let options: MutationOptions;

const queryClient = {
    invalidateQueries,
    cancelQueries: vi.fn(async () => undefined),
    getQueryData: vi.fn(() => categories),
    setQueryData: vi.fn((_key: unknown, updater: CachedCategory[] | ((old: CachedCategory[]) => CachedCategory[])) => {
        categories = typeof updater === "function" ? updater(categories) : updater;
    }),
};

vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => queryClient }));
vi.mock("../useBudgets", () => ({ budgetKeys: { all: ["budgets"] } }));
vi.mock("../reports/useSpendingReport", () => ({ reportKeys: { all: ["reports"] } }));
vi.mock("../transactions/useReimbursements", () => ({ reimbursementKeys: { all: ["reimbursements"] } }));
vi.mock("../transactions/useTransactions", () => ({ transactionKeys: { all: ["transactions"] } }));

beforeEach(() => {
    vi.clearAllMocks();
    categories = [{ id: "c1", name: "Food", color: "#ff0000", icon: "film" }];
    vi.stubGlobal("useApiClient", () => ({}));
    vi.stubGlobal("useMutation", (opts: MutationOptions) => {
        options = opts;
        return {};
    });
    useUpdateCategoryMutation();
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);

describe("useUpdateCategoryMutation", () => {
    it("invalidates categories and every view that shows category avatars", () => {
        options.onSettled();
        expect(invalidatedKeys()).toEqual(
            expect.arrayContaining([["categories"], ["transactions"], ["budgets"], ["reports"], ["reimbursements"]]),
        );
    });

    it("keeps the cached icon when the update does not send one", async () => {
        await options.onMutate({ id: "c1", data: { name: "Eats" } });
        expect(categories[0]).toMatchObject({ name: "Eats", icon: "film" });
    });

    it("sets the cached icon when the update sends one", async () => {
        await options.onMutate({ id: "c1", data: { icon: "tag" } });
        expect(categories[0]?.icon).toBe("tag");
    });

    it("clears the cached icon when the update sends null", async () => {
        await options.onMutate({ id: "c1", data: { icon: null } });
        expect(categories[0]?.icon).toBeUndefined();
    });
});
