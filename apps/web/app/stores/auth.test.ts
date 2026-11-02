import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAuthUser } from "@badger/types";
import { useAuthStore } from "./auth";

vi.mock("../composables/useApiClient", () => ({ useApiClient: () => ({}) }));

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
