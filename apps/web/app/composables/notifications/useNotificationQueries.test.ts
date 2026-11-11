import { beforeEach, describe, expect, it, vi } from "vitest";
import { toValue } from "vue";

import {
    notificationKeys,
    useNotificationPreferencesQuery,
    useUpdateNotificationPreferencesMutation,
    usePushSubscriptionsQuery,
    useVapidPublicKeyQuery,
} from "./useNotificationQueries";

const { auth, api } = vi.hoisted(() => ({
    auth: { user: null as { id: string } | null },
    api: {
        getVapidPublicKey: vi.fn(),
        getPushSubscriptions: vi.fn(),
        getNotificationPreferences: vi.fn(),
        updateNotificationPreferences: vi.fn(),
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

beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: "u1" };
});

describe("notificationKeys", () => {
    it("keys per-user lists by the user id", () => {
        expect(notificationKeys.subscriptions("u1")).toEqual(["notifications", "subscriptions", "u1"]);
        expect(notificationKeys.preferences("u1")).not.toEqual(notificationKeys.preferences("u2"));
    });
});

describe("notification queries", () => {
    it("keeps the VAPID key cached forever", () => {
        const query = useVapidPublicKeyQuery() as unknown as { staleTime: number; queryKey: unknown };
        expect(query.staleTime).toBe(Infinity);
        expect(query.queryKey).toEqual(["notifications", "vapidKey"]);
    });

    it("only runs the per-user queries with a signed-in user", () => {
        const signedIn = usePushSubscriptionsQuery() as unknown as { enabled: { value: boolean } };
        expect(signedIn.enabled.value).toBe(true);
        expect((useNotificationPreferencesQuery() as unknown as { enabled: { value: boolean } }).enabled.value).toBe(
            true,
        );

        auth.user = null;
        const signedOut = usePushSubscriptionsQuery() as unknown as { enabled: { value: boolean } };
        expect(signedOut.enabled.value).toBe(false);
    });

    it("keys the subscriptions query by the signed-in user", () => {
        const query = usePushSubscriptionsQuery() as unknown as { queryKey: unknown };
        expect(toValue(query.queryKey as never)).toEqual(["notifications", "subscriptions", "u1"]);
    });
});

describe("useUpdateNotificationPreferencesMutation", () => {
    it("writes the response into the cache entry of the user who started the save", async () => {
        const preferences = [
            {
                type: "system.test" as const,
                label: "Test",
                description: "",
                enabled: false,
                mandatory: false,
            },
        ];
        api.updateNotificationPreferences.mockResolvedValue(preferences);
        const mutation = useUpdateNotificationPreferencesMutation() as unknown as {
            onMutate: () => { userId: string | undefined };
            onSuccess: (data: unknown, vars: unknown, ctx: { userId: string | undefined }) => void;
        };

        const context = mutation.onMutate();
        mutation.onSuccess(preferences, {}, context);

        expect(setQueryData).toHaveBeenCalledWith(["notifications", "preferences", "u1"], preferences);
    });
});
