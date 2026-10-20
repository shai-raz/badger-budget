import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCreateTransaction, useDeleteTransaction } from "./useTransactions";
import { useUpdateTransactionMutation } from "./useUpdateTransaction.mutation";

const invalidateQueries = vi.fn();
let mutationOptions: { onSuccess: (...args: unknown[]) => void };
const useMutation = vi.fn((opts: typeof mutationOptions) => {
    mutationOptions = opts;
    return {};
});

vi.mock("@tanstack/vue-query", () => ({
    useQuery: vi.fn(),
    useInfiniteQuery: vi.fn(),
    keepPreviousData: vi.fn(),
    useMutation: (opts: typeof mutationOptions) => useMutation(opts),
    useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock("../useApiClient", () => ({ useApiClient: () => ({}) }));
vi.mock("../useBudgets", () => ({ budgetKeys: { all: ["budgets"] } }));

beforeEach(() => {
    vi.clearAllMocks();
    // Nuxt auto-imports used by the update mutation file.
    vi.stubGlobal("useApiClient", () => ({}));
    vi.stubGlobal("useMutation", (opts: typeof mutationOptions) => useMutation(opts));
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);

describe("transaction mutations invalidate account balances", () => {
    it("create", () => {
        useCreateTransaction();
        mutationOptions.onSuccess();
        expect(invalidatedKeys()).toContainEqual(["accounts"]);
    });

    it("delete", () => {
        useDeleteTransaction();
        mutationOptions.onSuccess(undefined, "t1");
        expect(invalidatedKeys()).toContainEqual(["accounts"]);
    });

    it("update", () => {
        useUpdateTransactionMutation();
        mutationOptions.onSuccess();
        expect(invalidatedKeys()).toContainEqual(["accounts"]);
    });
});
