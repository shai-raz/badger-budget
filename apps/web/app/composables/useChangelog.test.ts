import { beforeEach, describe, expect, it, vi } from "vitest";
import { toValue } from "vue";

import { useChangelog, useMarkChangelogSeen } from "./useChangelog";

const { auth } = vi.hoisted(() => ({ auth: { user: null as { id: string } | null } }));
const setQueryData = vi.fn();

vi.mock("@tanstack/vue-query", () => ({
    useQuery: (opts: unknown) => opts,
    useMutation: (opts: unknown) => opts,
    useQueryClient: () => ({ setQueryData }),
}));
vi.mock("./useApiClient", () => ({
    useApiClient: () => ({ getChangelog: vi.fn(), markChangelogSeen: vi.fn() }),
}));
vi.mock("~/stores/auth", () => ({ useAuthStore: () => auth }));

beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: "u1" };
});

describe("useChangelog", () => {
    it("keys the cache entry by the signed-in user", () => {
        const query = useChangelog() as unknown as { queryKey: unknown; enabled: unknown };
        expect(toValue(query.queryKey as never)).toEqual(["system", "changelog", "u1"]);
        expect(toValue(query.enabled as never)).toBe(true);
    });

    it("does not fetch while no user is signed in", () => {
        auth.user = null;
        const query = useChangelog() as unknown as { enabled: unknown };
        expect(toValue(query.enabled as never)).toBe(false);
    });
});

describe("useMarkChangelogSeen", () => {
    it("writes the stamp into the cache entry of the user who started it", () => {
        const mutation = useMarkChangelogSeen() as unknown as {
            onMutate: () => { userId?: string };
            onSuccess: (data: unknown, variables: unknown, context: { userId?: string }) => void;
        };
        const context = mutation.onMutate();
        auth.user = { id: "u2" };
        mutation.onSuccess({ lastSeenVersion: "1.0.0" }, undefined, context);

        expect(setQueryData).toHaveBeenCalledWith(["system", "changelog", "u1"], expect.any(Function));
    });
});
