import { beforeEach, describe, expect, it, vi } from "vitest";
import { toValue } from "vue";

import { settingsSummaryKeys, useSettingsSummaryQuery } from "./useSettingsSummary";

const { auth, api } = vi.hoisted(() => ({
    auth: { user: null as { id: string } | null },
    api: { getSettingsSummary: vi.fn() },
}));

vi.mock("@tanstack/vue-query", () => ({ useQuery: (opts: unknown) => opts }));
vi.mock("../useApiClient", () => ({ useApiClient: () => api }));
vi.mock("~/stores/auth", () => ({ useAuthStore: () => auth }));

const summary = { categories: 3, rules: 2, cardPayoffPatterns: 1, passkeys: 0, connectedApps: [] };

beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: "u1" };
});

describe("settingsSummaryKeys.detail", () => {
    it("scopes the key by user id", () => {
        expect(settingsSummaryKeys.detail("u1")).toEqual(["settingsSummary", "u1"]);
        expect(settingsSummaryKeys.detail("u2")).not.toEqual(settingsSummaryKeys.detail("u1"));
    });
});

describe("useSettingsSummaryQuery", () => {
    it("keys the query by the signed-in user and fetches the summary", async () => {
        api.getSettingsSummary.mockResolvedValue(summary);
        const query = useSettingsSummaryQuery() as unknown as {
            queryKey: unknown;
            queryFn: () => Promise<unknown>;
        };

        expect(toValue(query.queryKey)).toEqual(["settingsSummary", "u1"]);
        await expect(query.queryFn()).resolves.toEqual(summary);
        expect(api.getSettingsSummary).toHaveBeenCalledOnce();
    });

    it("is disabled without a signed-in user", () => {
        auth.user = null;
        const query = useSettingsSummaryQuery() as unknown as { enabled: unknown };

        expect(toValue(query.enabled)).toBe(false);
    });

    it("always refetches on mount with no stale window", () => {
        const query = useSettingsSummaryQuery() as unknown as { staleTime: number; refetchOnMount: string };

        expect(query.staleTime).toBe(0);
        expect(query.refetchOnMount).toBe("always");
    });
});
