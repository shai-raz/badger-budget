import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { COLOR_THEMES } from "@badger/shared-data";
import type { IAuthUser } from "@badger/types";
import { useAuthStore } from "~/stores/auth";
import { useThemeStore } from "~/stores/theme";
import Appearance from "./appearance.vue";

const select = vi.hoisted(() => vi.fn());

// The real composable saves through the API; the page only needs its select and device-only flag.
vi.mock("../../composables/settings/useSelectColorTheme", async () => {
    const { computed, ref } = await import("vue");
    const { useAuthStore: authStore } = await import("~/stores/auth");
    return {
        useSelectColorTheme: () => ({
            select,
            isDeviceOnly: computed(() => authStore().user?.isDemo === true),
            isSaving: ref(false),
        }),
    };
});

const baseUser = {
    id: "u1",
    email: "a@example.com",
    firstName: "A",
    lastName: "B",
    role: "USER",
    colorTheme: "noir",
    isDemo: false,
} satisfies IAuthUser;

beforeEach(() => {
    vi.clearAllMocks();
    useThemeStore().colorTheme = "noir";
    useAuthStore().user = { ...baseUser };
});

describe("settings appearance page", () => {
    it("renders one radio per colour theme, with the current theme checked", async () => {
        const wrapper = await mountSuspended(Appearance);

        const radios = wrapper.findAll('[role="radio"]');
        expect(radios).toHaveLength(COLOR_THEMES.length);
        expect(wrapper.get('[role="radiogroup"]').attributes("aria-labelledby")).toBe("color-theme-heading");
        expect(wrapper.get('[role="radio"][aria-checked="true"]').text()).toContain("Noir");
    });

    it("selects the next theme on ArrowRight", async () => {
        const wrapper = await mountSuspended(Appearance);

        await wrapper.get('[role="radiogroup"]').trigger("keydown", { key: "ArrowRight" });

        expect(select).toHaveBeenCalledWith("ocean");
    });

    it("says the colour theme is saved on this device for the demo user", async () => {
        useAuthStore().user = { ...baseUser, isDemo: true };
        const wrapper = await mountSuspended(Appearance);

        expect(wrapper.text()).toContain("Saved on this device");
        expect(wrapper.text()).not.toContain("Synced to your account");
    });

    it("says the colour theme is synced to the account for other users", async () => {
        const wrapper = await mountSuspended(Appearance);

        expect(wrapper.text()).toContain("Synced to your account");
    });

    it("shows a hidden icon before each Mode option, keeping the label as the accessible name", async () => {
        const wrapper = await mountSuspended(Appearance);

        const expected = [
            { icon: "pi-desktop", label: "System" },
            { icon: "pi-sun", label: "Light" },
            { icon: "pi-moon", label: "Dark" },
        ];
        for (const { icon, label } of expected) {
            const iconEl = wrapper.get(`i.pi.${icon}`);
            expect(iconEl.attributes("aria-hidden")).toBe("true");
            expect(iconEl.element.parentElement?.textContent).toContain(label);
        }
    });

    it("keeps the Mode options equal width and the control full width below md, natural width from md up", async () => {
        const wrapper = await mountSuspended(Appearance);

        const root = wrapper.get('[aria-label="Mode"]');
        expect(root.classes()).toEqual(expect.arrayContaining(["w-full", "md:inline-flex", "md:w-auto"]));

        for (const icon of ["pi-desktop", "pi-sun", "pi-moon"]) {
            const toggle = wrapper.get(`i.pi.${icon}`).element.closest(".p-togglebutton");
            expect(toggle).not.toBeNull();
            expect(toggle?.classList).toContain("flex-1");
            expect(toggle?.classList).toContain("md:w-28");
            expect(toggle?.classList).toContain("md:flex-none");
        }
    });
});
