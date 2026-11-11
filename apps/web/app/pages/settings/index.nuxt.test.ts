import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { PushDeviceState } from "~/utils/push/pushState";
import { useAuthStore } from "~/stores/auth";
import Settings from "./index.vue";

const m = await vi.hoisted(async () => {
    const { ref } = await import("vue");
    return {
        state: ref<PushDeviceState | "loading">("off"),
        refresh: vi.fn(() => Promise.resolve()),
    };
});

vi.mock("../../composables/notifications/usePushDevice", () => ({
    usePushDevice: () => ({ state: m.state, refresh: m.refresh }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    m.state.value = "off";
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

// The Notifications row's summary line, under its title.
async function notificationsSummary(): Promise<string> {
    const wrapper = await mountSuspended(Settings, {
        global: {
            stubs: { BankSyncPasskeysCard: true, SettingsMcpConnectionsCard: true, SettingsAboutCard: true },
        },
    });
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
