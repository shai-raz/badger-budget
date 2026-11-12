import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IAuthUser } from "@badger/types";
import { useAuthStore } from "./auth";

const { api, keyStore } = vi.hoisted(() => ({
    api: {
        logout: vi.fn(),
        getVapidPublicKey: vi.fn(),
        registerPushSubscription: vi.fn(),
        unregisterPushSubscription: vi.fn(),
        disableAutoSync: vi.fn(),
        getAutoSync: vi.fn(),
    },
    keyStore: { load: vi.fn(), clear: vi.fn() },
}));

vi.mock("../composables/useApiClient", () => ({ useApiClient: () => api }));
vi.mock("../utils/push/autoSyncKeyStore", () => ({
    loadAutoSyncKey: (...args: unknown[]) => keyStore.load(...args),
    clearAutoSyncKey: (...args: unknown[]) => keyStore.clear(...args),
}));

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
        api.disableAutoSync.mockResolvedValue(undefined);
        api.getAutoSync.mockResolvedValue({ autoSync: { id: "grant-1" } });
        keyStore.load.mockResolvedValue(null);
        keyStore.clear.mockResolvedValue(undefined);
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

    const HELD_GRANT = { grantId: "grant-1", key: "device-key", apiBaseUrl: "/api/v1" };

    it("turns auto-sync off on the server before the sign-out call when this device holds the grant", async () => {
        keyStore.load.mockResolvedValue(HELD_GRANT);
        const store = signIn();
        await store.logout();

        expect(api.disableAutoSync).toHaveBeenCalledTimes(1);
        const disableCalledAt = api.disableAutoSync.mock.invocationCallOrder[0] ?? Infinity;
        const logoutCalledAt = api.logout.mock.invocationCallOrder[0] ?? 0;
        expect(disableCalledAt).toBeLessThan(logoutCalledAt);
    });

    it("leaves auto-sync alone when this device holds no grant", async () => {
        const store = signIn();
        await store.logout();

        expect(api.disableAutoSync).not.toHaveBeenCalled();
    });

    it("leaves the current holder's auto-sync alone when this device's stored grant has moved away", async () => {
        keyStore.load.mockResolvedValue(HELD_GRANT);
        api.getAutoSync.mockResolvedValue({ autoSync: { id: "grant-2" } });
        const store = signIn();
        await store.logout();

        expect(api.disableAutoSync).not.toHaveBeenCalled();
        expect(keyStore.clear).toHaveBeenCalledTimes(1);
        expect(api.logout).toHaveBeenCalledWith("refresh");
        expect(store.isAuthenticated).toBe(false);
    });

    it("clears the device key even when turning auto-sync off fails", async () => {
        keyStore.load.mockResolvedValue(HELD_GRANT);
        api.disableAutoSync.mockRejectedValue(new Error("server down"));
        const store = signIn();
        await store.logout();

        expect(keyStore.clear).toHaveBeenCalledTimes(1);
        expect(api.logout).toHaveBeenCalledWith("refresh");
        expect(store.isAuthenticated).toBe(false);
    });

    it("still signs out when turning auto-sync off never answers, once the cleanup timeout passes", async () => {
        vi.useFakeTimers();
        keyStore.load.mockResolvedValue(HELD_GRANT);
        api.disableAutoSync.mockReturnValue(new Promise(() => undefined));
        const store = signIn();

        const pending = store.logout();
        await vi.advanceTimersByTimeAsync(3000);
        await pending;

        expect(api.logout).toHaveBeenCalledWith("refresh");
        expect(localStorage.getItem("access_token")).toBeNull();
        expect(keyStore.clear).toHaveBeenCalledTimes(1);
    });

    it("clears the device key when the sign-out call fails", async () => {
        api.logout.mockRejectedValue(new Error("network down"));
        const store = signIn();
        await store.logout();

        expect(keyStore.clear).toHaveBeenCalledTimes(1);
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
