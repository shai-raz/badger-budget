import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMarkCardPayoff } from "./useMarkCardPayoff";

const invalidateQueries = vi.fn().mockResolvedValue(undefined);
const toastAdd = vi.fn();
let mutationOptions: { onSuccess: (data: unknown) => void };

vi.mock("@tanstack/vue-query", () => ({
    useMutation: (opts: typeof mutationOptions) => {
        mutationOptions = opts;
        return {};
    },
    useQueryClient: () => ({ invalidateQueries }),
    keepPreviousData: vi.fn(),
    useQuery: vi.fn(),
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock("../useApiClient", () => ({ useApiClient: () => ({}) }));
vi.mock("../useBudgets", () => ({ budgetKeys: { all: ["budgets"] } }));
vi.mock("../reports/useSpendingReport", () => ({ reportKeys: { all: ["reports"] } }));
vi.mock("./useTransactions", () => ({ transactionKeys: { all: ["transactions"] } }));

beforeEach(() => {
    vi.clearAllMocks();
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);

describe("useMarkCardPayoff", () => {
    it("invalidates everything that reads net amounts, not just transactions", () => {
        useMarkCardPayoff();
        mutationOptions.onSuccess({ count: 2, linksRemoved: 0 });
        expect(invalidatedKeys()).toEqual(
            expect.arrayContaining([["transactions"], ["budgets"], ["reports"], ["reimbursements"], ["accounts"]]),
        );
    });

    it("keeps the toast as before when no links were removed", () => {
        useMarkCardPayoff();
        mutationOptions.onSuccess({ count: 2, linksRemoved: 0 });
        expect(toastAdd).toHaveBeenCalledWith(
            expect.objectContaining({ detail: "Marked 2 transaction(s) as hidden transfers" }),
        );
    });

    it("reports removed links in the toast", () => {
        useMarkCardPayoff();
        mutationOptions.onSuccess({ count: 2, linksRemoved: 3 });
        expect(toastAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                detail: "Marked 2 transaction(s) as hidden transfers · 3 reimbursement links removed",
            }),
        );
    });
});
