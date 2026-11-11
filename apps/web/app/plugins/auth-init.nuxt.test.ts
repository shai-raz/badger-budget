import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNuxtApp } from "#app";
import { createPinia, setActivePinia } from "pinia";
import type { IAuthUser } from "@badger/types";
import { useAuthStore } from "~/stores/auth";
import authInit from "./auth-init";

const { api, sync } = vi.hoisted(() => ({
    api: {
        getMe: vi.fn(),
        backfillCurrencies: vi.fn(),
    },
    sync: vi.fn(),
}));

vi.mock("~/composables/useApiClient", () => ({ useApiClient: () => api }));
vi.mock("~/utils/push/pushDeps", () => ({ syncThisBrowserPush: sync }));

const user = {
    id: "u1",
    email: "a@example.com",
    firstName: "A",
    lastName: "B",
    role: "USER",
    colorTheme: null,
    isDemo: false,
} satisfies IAuthUser;

describe("auth-init plugin push sync", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        localStorage.clear();
        vi.resetAllMocks();
        api.backfillCurrencies.mockResolvedValue(undefined);
        sync.mockResolvedValue(undefined);
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("re-registers the browser's push subscription on start for a signed-in user", async () => {
        localStorage.setItem("access_token", "access");
        api.getMe.mockResolvedValue(user);

        await authInit(useNuxtApp());

        expect(useAuthStore().isAuthenticated).toBe(true);
        expect(sync).toHaveBeenCalledTimes(1);
        expect(sync).toHaveBeenCalledWith(api);
    });

    it("does not sync push for the demo user", async () => {
        localStorage.setItem("access_token", "access");
        api.getMe.mockResolvedValue({ ...user, isDemo: true });

        await authInit(useNuxtApp());

        expect(useAuthStore().isAuthenticated).toBe(true);
        expect(sync).not.toHaveBeenCalled();
    });

    it("does not sync push without a session", async () => {
        await authInit(useNuxtApp());

        expect(api.getMe).not.toHaveBeenCalled();
        expect(sync).not.toHaveBeenCalled();
    });

    it("does not sync push when the session cannot be restored", async () => {
        localStorage.setItem("access_token", "access");
        api.getMe.mockRejectedValue({ response: { status: 401 } });

        await authInit(useNuxtApp());

        expect(useAuthStore().isAuthenticated).toBe(false);
        expect(sync).not.toHaveBeenCalled();
    });

    it("does not block app start when the sync fails", async () => {
        localStorage.setItem("access_token", "access");
        api.getMe.mockResolvedValue(user);
        sync.mockRejectedValue(new Error("offline"));

        await expect(authInit(useNuxtApp())).resolves.toBeUndefined();
        expect(useAuthStore().isAuthenticated).toBe(true);
    });
});
