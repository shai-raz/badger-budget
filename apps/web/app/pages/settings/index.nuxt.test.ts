import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import type { ISettingsSummary, ISystemInfo } from "@badger/types";
import type { PushDeviceState } from "~/utils/push/pushState";
import { useAuthStore } from "~/stores/auth";
import Settings from "./index.vue";

const m = await vi.hoisted(async () => {
    const { ref } = await import("vue");
    return {
        state: ref<PushDeviceState | "loading">("off"),
        refresh: vi.fn(() => Promise.resolve()),
        summaryData: ref<ISettingsSummary | undefined>(undefined),
        summaryLoading: ref(false),
        summaryError: ref(false),
        systemInfo: ref<ISystemInfo | undefined>(undefined),
        logout: vi.fn(),
    };
});

vi.mock("../../composables/notifications/usePushDevice", () => ({
    usePushDevice: () => ({ state: m.state, refresh: m.refresh }),
}));

vi.mock("../../composables/settings/useSettingsSummary", () => ({
    useSettingsSummaryQuery: () => ({
        data: m.summaryData,
        isLoading: m.summaryLoading,
        isError: m.summaryError,
    }),
}));

mockNuxtImport("useSystemInfo", () => () => ({ data: m.systemInfo }));
mockNuxtImport("useLogout", () => () => m.logout);

const counts: ISettingsSummary = {
    categories: 1,
    rules: 2,
    cardPayoffPatterns: 2,
    passkeys: 0,
    connectedApps: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    m.state.value = "off";
    m.summaryData.value = counts;
    m.summaryLoading.value = false;
    m.summaryError.value = false;
    m.systemInfo.value = undefined;
    useAuthStore().user = {
        id: "u1",
        email: "a@example.com",
        firstName: "A",
        lastName: "B",
        role: "ADMIN",
        colorTheme: "noir",
        isDemo: false,
    };
});

const stubs = { BankSyncPasskeysCard: true, SettingsMcpConnectionsCard: true, SettingsAboutCard: true };

async function mountPage() {
    return mountSuspended(Settings, { global: { stubs } });
}

// The Notifications row's summary line, under its title.
async function notificationsSummary(): Promise<string> {
    const wrapper = await mountPage();
    const row = wrapper.get('a[href="/settings/notifications"]');
    return row.findAll("span.text-xs").map((span) => span.text())[0] ?? "";
}

describe("settings index notifications row", () => {
    it.each<[PushDeviceState, string]>([
        ["on", "On for this device"],
        ["off", "Off for this device"],
        ["denied", "Blocked in this browser"],
        ["ios-install", "Needs Home Screen install"],
        ["unsupported", "Not supported here"],
    ])("summarises the %s state as %s", async (state, summary) => {
        m.state.value = state;

        expect(await notificationsSummary()).toBe(summary);
    });
});

describe("settings index transactions rows", () => {
    it("shows the live counts with singular and plural labels", async () => {
        const wrapper = await mountPage();

        expect(wrapper.get('a[href="/categories"]').text()).toContain("1 category");
        expect(wrapper.get('a[href="/settings/rules"]').text()).toContain("2 rules");
        expect(wrapper.get('a[href="/settings/card-payoff-patterns"]').text()).toContain("2 patterns");
    });

    it("shows a Skeleton and no subtitle while loading", async () => {
        m.summaryData.value = undefined;
        m.summaryLoading.value = true;
        const wrapper = await mountPage();

        for (const href of ["/categories", "/settings/rules", "/settings/card-payoff-patterns"]) {
            const row = wrapper.get(`a[href="${href}"]`);
            expect(row.find(".p-skeleton").exists()).toBe(true);
            expect(row.find("span.text-xs").exists()).toBe(false);
        }
    });

    it("renders the rows without a subtitle on error and keeps them linked", async () => {
        m.summaryData.value = undefined;
        m.summaryError.value = true;
        const wrapper = await mountPage();

        for (const href of ["/categories", "/settings/rules", "/settings/card-payoff-patterns"]) {
            const row = wrapper.get(`a[href="${href}"]`);
            expect(row.find("span.text-xs").exists()).toBe(false);
        }
    });
});

describe("settings index profile and footer", () => {
    it("shows the initials, name and email", async () => {
        const wrapper = await mountPage();
        const profile = wrapper.get('section[aria-label="Profile"]');

        expect(profile.text()).toContain("AB");
        expect(profile.text()).toContain("A B");
        expect(profile.text()).toContain("a@example.com");
    });

    it("shows the app version in the footer", async () => {
        m.systemInfo.value = {
            version: "0.19.1",
            commit: null,
            latest: null,
            updateAvailable: false,
            updateComparable: false,
            checkedAt: null,
            updateCheckEnabled: false,
            upgradeAvailable: false,
            releaseUrl: null,
        };
        const wrapper = await mountPage();

        expect(wrapper.text()).toContain("Badger Budget 0.19.1");
    });
});

describe("settings index log out", () => {
    it("calls logout when the Log out row is clicked", async () => {
        const wrapper = await mountPage();

        await wrapper.get('section[aria-label="Log out"] button').trigger("click");

        expect(m.logout).toHaveBeenCalledTimes(1);
    });
});
