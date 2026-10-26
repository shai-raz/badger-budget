import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import type { MonthlySpending } from "@badger/types";

// The merge logic is covered by utils/monthStrip.test.ts. These tests cover the wiring: query keys, staleness,
// the fetcher's range and how errors and refetches are routed.

const getMonthlySpending = vi.fn();
const refetchFns = [vi.fn(), vi.fn()];
const queryResults = ref<Array<{ data?: MonthlySpending; error?: unknown; isError: boolean; refetch: () => void }>>([]);
let capturedOptions: { queries: { value: Array<Record<string, unknown>> } } | null = null;

vi.mock("@tanstack/vue-query", () => ({
    useQuery: vi.fn(),
    useQueries: (options: { queries: { value: Array<Record<string, unknown>> } }) => {
        capturedOptions = options;
        return queryResults;
    },
}));
vi.mock("../useApiClient", () => ({ useApiClient: () => ({ getMonthlySpending }) }));

const NOW = new Date(2026, 9, 26);

const page = (months: Array<[string, number]>, firstMonth: string | null): MonthlySpending => ({
    startMonth: months[0]?.[0] ?? "",
    endMonth: months[months.length - 1]?.[0] ?? "",
    currency: { code: "USD", symbol: "$" },
    months: months.map(([month, total]) => ({ month, total, transactionCount: 0 })),
    firstMonth,
});

describe("useMonthlySpending", () => {
    beforeEach(() => {
        getMonthlySpending.mockReset();
        refetchFns.forEach((fn) => fn.mockReset());
        queryResults.value = [];
    });

    it("builds one query per page with the page's month range and a 30 minute staleTime", async () => {
        const { useMonthlySpending } = await import("./useMonthlySpending");
        useMonthlySpending(ref([0, 1]), NOW);

        const queries = capturedOptions!.queries.value;
        expect(queries).toHaveLength(2);
        expect(queries[0]!.queryKey).toEqual(["reports", "monthly", { startMonth: "2024-11", endMonth: "2026-10" }]);
        expect(queries[1]!.queryKey).toEqual(["reports", "monthly", { startMonth: "2022-11", endMonth: "2024-10" }]);
        expect(queries[0]!.staleTime).toBe(30 * 60 * 1000);
        expect(queries[1]!.staleTime).toBe(30 * 60 * 1000);
    });

    it("fetches each page with its own range", async () => {
        const { useMonthlySpending } = await import("./useMonthlySpending");
        useMonthlySpending(ref([1]), NOW);

        const queryFn = capturedOptions!.queries.value[0]!.queryFn as () => Promise<unknown>;
        await queryFn();
        expect(getMonthlySpending).toHaveBeenCalledWith({ startMonth: "2022-11", endMonth: "2024-10" });
    });

    it("merges loaded pages into totals and the earliest first month, skipping pages still loading", async () => {
        const { useMonthlySpending } = await import("./useMonthlySpending");
        const { totals, firstMonth, error } = useMonthlySpending(ref([0, 1]), NOW);

        queryResults.value = [
            { data: page([["2026-10", 120]], "2024-11"), isError: false, refetch: refetchFns[0]! },
            { data: undefined, isError: false, refetch: refetchFns[1]! },
        ];

        expect(totals.value).toEqual({ "2026-10": 120 });
        expect(firstMonth.value).toBe("2024-11");
        expect(error.value).toBeNull();
    });

    it("takes the currency from the first loaded page", async () => {
        const { useMonthlySpending } = await import("./useMonthlySpending");
        const { currency } = useMonthlySpending(ref([0]), NOW);

        expect(currency.value).toBeNull();
        queryResults.value = [{ data: page([["2026-10", 120]], "2024-11"), isError: false, refetch: refetchFns[0]! }];
        expect(currency.value).toEqual({ code: "USD", symbol: "$" });
    });

    it("exposes the first error and refetches only the failed pages", async () => {
        const { useMonthlySpending } = await import("./useMonthlySpending");
        const { error, refetch } = useMonthlySpending(ref([0, 1]), NOW);

        const failure = new Error("boom");
        queryResults.value = [
            { data: page([["2026-10", 50]], "2024-11"), isError: false, refetch: refetchFns[0]! },
            { data: undefined, error: failure, isError: true, refetch: refetchFns[1]! },
        ];

        expect(error.value).toBe(failure);
        refetch();
        expect(refetchFns[0]).not.toHaveBeenCalled();
        expect(refetchFns[1]).toHaveBeenCalledTimes(1);
    });
});
