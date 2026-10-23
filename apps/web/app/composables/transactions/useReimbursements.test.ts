import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { useReimbursementCandidates } from "./useReimbursements";

let queryOptions: {
    queryKey: { value: unknown[] };
    enabled: { value: boolean };
    staleTime: number;
};

vi.mock("@tanstack/vue-query", () => ({
    useQuery: (opts: typeof queryOptions) => {
        queryOptions = opts;
        return {};
    },
    useMutation: vi.fn(),
    useQueryClient: vi.fn(),
    keepPreviousData: vi.fn(),
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock("../useApiClient", () => ({ useApiClient: () => ({}) }));
vi.mock("../useBudgets", () => ({ budgetKeys: { all: ["budgets"] } }));
vi.mock("../reports/useSpendingReport", () => ({ reportKeys: { all: ["reports"] } }));
vi.mock("../accounts/accountKeys", () => ({ accountKeys: { all: ["accounts"] } }));
vi.mock("./useTransactions", () => ({ transactionKeys: { all: ["transactions"] } }));

beforeEach(() => {
    vi.clearAllMocks();
});

describe("useReimbursementCandidates", () => {
    it("fetches only while the picker is open for a transaction", () => {
        const open = ref(false);
        const transactionId = ref<string | null>("tx-1");
        useReimbursementCandidates(transactionId, ref(""), open);

        expect(queryOptions.enabled.value).toBe(false);

        open.value = true;
        expect(queryOptions.enabled.value).toBe(true);

        transactionId.value = null;
        expect(queryOptions.enabled.value).toBe(false);
    });

    it("always refetches on open instead of reusing a cached list", () => {
        useReimbursementCandidates(ref("tx-1"), ref(""), ref(true));
        expect(queryOptions.staleTime).toBe(0);
    });

    it("keys an emptied search immediately rather than waiting out the debounce", () => {
        const search = ref("previous");
        useReimbursementCandidates(ref("tx-1"), search, ref(true));

        search.value = "";

        expect(queryOptions.queryKey.value).toEqual(["reimbursements", "candidates", "tx-1", ""]);
    });
});
