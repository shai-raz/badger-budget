import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IAuthUser } from "@badger/types";
import { useAuthStore } from "./auth";

const { api } = vi.hoisted(() => ({
    api: {
        logout: vi.fn(),
        getVapidPublicKey: vi.fn(),
        registerPushSubscription: vi.fn(),
        unregisterPushSubscription: vi.fn(),
    },
}));

vi.mock("../composables/useApiClient", () => ({ useApiClient: () => api }));

const baseUser = {
    id: "u1",
    email: "a@example.com",
    firstName: "A",
    lastName: "B",
    colorTheme: null,
    isDemo: false,
};

describe("auth store isAdmin", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("is false when no user is loaded", () => {
        expect(useAuthStore().isAdmin).toBe(false);
    });

    it("is true for the ADMIN role", () => {
        const store = useAuthStore();
        store.user = { ...baseUser, role: "ADMIN" } satisfies IAuthUser;
        expect(store.isAdmin).toBe(true);
    });

    it("is false for the USER role", () => {
        const store = useAuthStore();
        store.user = { ...baseUser, role: "USER" };
        expect(store.isAdmin).toBe(false);
    });

    it("follows a role change on the same user without a new sign-in", () => {
        const store = useAuthStore();
        store.user = { ...baseUser, role: "USER" };
        store.user = { ...baseUser, role: "ADMIN" };
        expect(store.isAdmin).toBe(true);
    });
});

const ENDPOINT = "https://push.example/abc";

function memoryStorage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
        clear: () => values.clear(),
    };
}

function fakeSubscription() {
    return {
        endpoint: ENDPOINT,
        options: { applicationServerKey: null },
        toJSON: () => ({}),
        unsubscribe: vi.fn(() => Promise.resolve(true)),
    };
}

describe("auth store logout", () => {
    let subscription: ReturnType<typeof fakeSubscription>;
    let getRegistration: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.resetAllMocks();
        vi.stubGlobal("localStorage", memoryStorage());
        subscription = fakeSubscription();
        getRegistration = vi.fn(() =>
            Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(subscription) } }),
        );
        vi.stubGlobal("navigator", { userAgent: "", maxTouchPoints: 0, serviceWorker: { getRegistration } });
        api.logout.mockResolvedValue(undefined);
        api.unregisterPushSubscription.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    function signIn(isDemo = false) {
        localStorage.setItem("access_token", "access");
        localStorage.setItem("refresh_token", "refresh");
        const store = useAuthStore();
        store.user = { ...baseUser, role: "USER", isDemo } satisfies IAuthUser;
        store.isAuthenticated = true;
        return store;
    }

    it("removes this browser's push subscription before the sign-out call", async () => {
        const store = signIn();
        await store.logout();

        expect(api.unregisterPushSubscription).toHaveBeenCalledWith(ENDPOINT);
        expect(subscription.unsubscribe).toHaveBeenCalled();
        const unregisterCalledAt = api.unregisterPushSubscription.mock.invocationCallOrder[0] ?? Infinity;
        const logoutCalledAt = api.logout.mock.invocationCallOrder[0] ?? 0;
        expect(unregisterCalledAt).toBeLessThan(logoutCalledAt);
    });

    it("still signs out and clears the session when the unregister call rejects", async () => {
        api.unregisterPushSubscription.mockRejectedValue(new Error("server down"));
        const store = signIn();
        await store.logout();

        expect(api.logout).toHaveBeenCalledWith("refresh");
        expect(localStorage.getItem("access_token")).toBeNull();
        expect(localStorage.getItem("refresh_token")).toBeNull();
        expect(store.user).toBeNull();
        expect(store.isAuthenticated).toBe(false);
    });

    it("still signs out when the browser never answers, once the cleanup timeout passes", async () => {
        vi.useFakeTimers();
        getRegistration.mockReturnValue(new Promise(() => undefined));
        const store = signIn();

        const pending = store.logout();
        await vi.advanceTimersByTimeAsync(3000);
        await pending;

        expect(api.logout).toHaveBeenCalledWith("refresh");
        expect(localStorage.getItem("access_token")).toBeNull();
        expect(store.isAuthenticated).toBe(false);
    });

    it("skips push cleanup for demo users", async () => {
        const store = signIn(true);
        await store.logout();

        expect(getRegistration).not.toHaveBeenCalled();
        expect(api.unregisterPushSubscription).not.toHaveBeenCalled();
        expect(api.logout).toHaveBeenCalled();
    });
});
