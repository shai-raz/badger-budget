import { beforeEach, describe, expect, it, vi } from "vitest";
import { toValue } from "vue";

import { useUpdateUserSettingsMutation, useUserSettingsQuery, userSettingsKeys } from "./useUserSettings";

const { auth, api } = vi.hoisted(() => ({
    auth: { user: null as { id: string } | null },
    api: {
        getMySettings: vi.fn(),
        updateMySettings: vi.fn(),
    },
}));
const setQueryData = vi.fn();

vi.mock("@tanstack/vue-query", () => ({
    useQuery: (opts: unknown) => opts,
    useMutation: (opts: unknown) => opts,
    useQueryClient: () => ({ setQueryData }),
}));
vi.mock("../useApiClient", () => ({ useApiClient: () => api }));
vi.mock("~/stores/auth", () => ({ useAuthStore: () => auth }));

const settings = { unmatchedImportCategory: "reuse_only" as const };

beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: "u1" };
});

describe("userSettingsKeys.detail", () => {
    it("gives each user their own cache entry", () => {
        expect(userSettingsKeys.detail("u1")).toEqual(["userSettings", "u1"]);
        expect(userSettingsKeys.detail("u1")).not.toEqual(userSettingsKeys.detail("u2"));
    });
});

describe("useUserSettingsQuery", () => {
    it("keys the query by the signed-in user", () => {
        const query = useUserSettingsQuery() as unknown as { queryKey: unknown };
        expect(toValue(query.queryKey as never)).toEqual(["userSettings", "u1"]);
    });

    it("runs only while there is a signed-in user", () => {
        const query = useUserSettingsQuery() as unknown as { enabled: unknown };
        expect(toValue(query.enabled as never)).toBe(true);

        auth.user = null;
        const signedOut = useUserSettingsQuery() as unknown as { enabled: unknown };
        expect(toValue(signedOut.enabled as never)).toBe(false);
    });

    it("fetches the settings from the API", async () => {
        api.getMySettings.mockResolvedValue(settings);
        const query = useUserSettingsQuery() as unknown as { queryFn: () => Promise<unknown> };

        await expect(query.queryFn()).resolves.toEqual(settings);
        expect(api.getMySettings).toHaveBeenCalledOnce();
    });
});

describe("useUpdateUserSettingsMutation", () => {
    it("saves the patch through the API", async () => {
        api.updateMySettings.mockResolvedValue(settings);
        const mutation = useUpdateUserSettingsMutation() as unknown as {
            mutationFn: (patch: unknown) => Promise<unknown>;
        };

        await expect(mutation.mutationFn({ unmatchedImportCategory: "reuse_only" })).resolves.toEqual(settings);
        expect(api.updateMySettings).toHaveBeenCalledWith({ unmatchedImportCategory: "reuse_only" });
    });

    it("writes the saved settings into the cache entry of the user who started the save", () => {
        const mutation = useUpdateUserSettingsMutation() as unknown as {
            onMutate: () => { userId?: string };
            onSuccess: (data: unknown, patch: unknown, context: { userId?: string }) => void;
        };
        const context = mutation.onMutate();
        auth.user = { id: "u2" };

        mutation.onSuccess(settings, { unmatchedImportCategory: "reuse_only" }, context);

        expect(setQueryData).toHaveBeenCalledWith(["userSettings", "u1"], settings);
    });
});
