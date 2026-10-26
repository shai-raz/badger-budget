import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, toValue } from "vue";

import { systemKeys, useCheckForUpdates, useSystemInfo } from "./useSystemInfo";

const { auth } = vi.hoisted(() => ({ auth: { user: null as { id: string } | null, isAuthenticated: true } }));
const setQueryData = vi.fn();

vi.mock("@tanstack/vue-query", () => ({
    useQuery: (opts: unknown) => opts,
    useMutation: (opts: unknown) => opts,
    useQueryClient: () => ({ setQueryData }),
}));
vi.mock("./useApiClient", () => ({
    useApiClient: () => ({ getSystemInfo: vi.fn(), checkForUpdates: vi.fn() }),
}));
vi.mock("~/stores/auth", () => ({ useAuthStore: () => auth }));

beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: "u1" };
});

describe("systemKeys.info", () => {
    it("gives each user their own cache entry, since upgradeAvailable is role-dependent", () => {
        expect(systemKeys.info("u1")).toEqual(["system", "info", "u1"]);
        expect(systemKeys.info("u1")).not.toEqual(systemKeys.info("u2"));
    });
});

describe("useSystemInfo", () => {
    it("keys the query by the signed-in user", () => {
        const query = useSystemInfo() as unknown as { queryKey: unknown };
        expect(toValue(query.queryKey as never)).toEqual(["system", "info", "u1"]);
    });

    it("does not poll unless an interval is given", () => {
        const query = useSystemInfo() as unknown as { refetchInterval: unknown };
        expect(toValue(query.refetchInterval as never)).toBe(false);
    });

    // The interval is a ref so TanStack re-arms its timer when it changes, without a query update.
    it("follows the refetch interval passed in reactively", () => {
        const interval = ref<number | false>(false);
        const query = useSystemInfo(true, { refetchInterval: interval }) as unknown as { refetchInterval: unknown };
        expect(toValue(query.refetchInterval as never)).toBe(false);
        interval.value = 5_000;
        expect(toValue(query.refetchInterval as never)).toBe(5_000);
    });
});

describe("useCheckForUpdates", () => {
    it("writes the result into the cache entry of the user who started the check", () => {
        const mutation = useCheckForUpdates() as unknown as {
            onMutate: () => { userId?: string };
            onSuccess: (data: unknown, variables: unknown, context: { userId?: string }) => void;
        };
        const context = mutation.onMutate();
        auth.user = { id: "u2" };
        mutation.onSuccess({ latest: "1.0.0" }, undefined, context);

        expect(setQueryData).toHaveBeenCalledWith(["system", "info", "u1"], { latest: "1.0.0" });
    });
});
