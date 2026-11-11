import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import type { IAuthUser, INotificationPreference, IPushSubscription } from "@badger/types";
import type { PushDeviceState } from "~/utils/push/pushState";
import { useAuthStore } from "~/stores/auth";
import Notifications from "./notifications.vue";

// Shared, resettable fakes for the composables the page reads and writes.
const m = await vi.hoisted(async () => {
    const { ref } = await import("vue");
    return {
        device: {
            state: ref<PushDeviceState | "loading">("off"),
            endpoint: ref<string | null>(null),
            busy: ref(false),
            error: ref<Error | null>(null),
            refresh: vi.fn(() => Promise.resolve()),
            enable: vi.fn(() => Promise.resolve()),
            disable: vi.fn(() => Promise.resolve()),
        },
        devtools: ref(false),
        subscriptions: { data: ref<IPushSubscription[] | undefined>([]), isLoading: ref(false), error: ref(null) },
        preferences: { data: ref<INotificationPreference[] | undefined>([]), isLoading: ref(false), error: ref(null) },
        updatePreferences: { mutate: vi.fn(), isPending: ref(false) },
        removeSubscription: { mutateAsync: vi.fn(() => Promise.resolve()), isPending: ref(false) },
        sendTest: { mutate: vi.fn(), isPending: ref(false) },
        toastAdd: vi.fn(),
    };
});

vi.mock("../../composables/notifications/usePushDevice", () => ({ usePushDevice: () => m.device }));
vi.mock("../../composables/useDevtoolsFlag", () => ({ useDevtoolsFlag: () => m.devtools }));
vi.mock("../../composables/notifications/useNotificationQueries", () => ({
    usePushSubscriptionsQuery: () => m.subscriptions,
    useNotificationPreferencesQuery: () => m.preferences,
    useUpdateNotificationPreferencesMutation: () => m.updatePreferences,
    useDeletePushSubscriptionMutation: () => m.removeSubscription,
    useSendTestNotificationMutation: () => m.sendTest,
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: m.toastAdd }) }));

const baseUser = {
    id: "u1",
    email: "a@example.com",
    firstName: "A",
    lastName: "B",
    role: "ADMIN",
    colorTheme: "noir",
    isDemo: false,
} satisfies IAuthUser;

const ENDPOINT_THIS = "https://push.example/this";
const ENDPOINT_OTHER = "https://push.example/other";

const subscription = (overrides: Partial<IPushSubscription>): IPushSubscription => ({
    id: "sub-1",
    endpoint: ENDPOINT_OTHER,
    deviceLabel: "Chrome on Windows",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    lastAcceptedAt: null,
    ...overrides,
});

const preferences: INotificationPreference[] = [
    {
        type: "system.update-available",
        label: "New version available",
        description: "When a new Badger Budget release is out.",
        enabled: false,
        mandatory: true,
    },
    {
        type: "system.test",
        label: "Test notification",
        description: "Sent from the developer options.",
        enabled: true,
        mandatory: false,
    },
];

beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore().user = { ...baseUser };
    m.device.state.value = "off";
    m.device.endpoint.value = null;
    m.device.busy.value = false;
    m.device.error.value = null;
    m.devtools.value = false;
    m.subscriptions.data.value = [];
    m.subscriptions.isLoading.value = false;
    m.subscriptions.error.value = null;
    m.preferences.data.value = preferences;
    m.preferences.isLoading.value = false;
    m.preferences.error.value = null;
    m.updatePreferences.isPending.value = false;
    m.removeSubscription.isPending.value = false;
    m.sendTest.isPending.value = false;
});

async function mountPage(): Promise<VueWrapper> {
    return mountSuspended(Notifications);
}

// Collapses the template's line breaks so copy can be matched as one sentence.
const pageText = (wrapper: VueWrapper) => wrapper.text().replace(/\s+/g, " ");

const buttonLabelled = (wrapper: VueWrapper, label: string) =>
    wrapper.findAll("button").find((button) => button.text() === label) ?? null;

// The band whose heading has this id, so assertions stay inside one section.
const bandById = (wrapper: VueWrapper, headingId: string) => wrapper.get(`#${headingId}`).element.closest("section");

describe("settings notifications page", () => {
    it.each<[PushDeviceState, string]>([
        ["unsupported", "This browser can't receive push notifications."],
        ["ios-install", "On iPhone and iPad, notifications need Badger on your Home Screen"],
        ["denied", "Notifications are blocked for Badger in this browser."],
    ])("explains the %s device state without an action", async (state, copy) => {
        m.device.state.value = state;
        const wrapper = await mountPage();

        expect(pageText(wrapper)).toContain(copy);
        expect(buttonLabelled(wrapper, "Turn on")).toBeNull();
        expect(buttonLabelled(wrapper, "Turn off")).toBeNull();
    });

    it("offers Turn on when this device is off, and calls enable from the click", async () => {
        const wrapper = await mountPage();

        expect(pageText(wrapper)).toContain("Notifications are off on this device.");
        await buttonLabelled(wrapper, "Turn on")?.trigger("click");
        expect(m.device.enable).toHaveBeenCalledTimes(1);
    });

    it("offers Turn off when this device is on, and calls disable", async () => {
        m.device.state.value = "on";
        const wrapper = await mountPage();

        expect(pageText(wrapper)).toContain("Notifications are on for this device.");
        await buttonLabelled(wrapper, "Turn off")?.trigger("click");
        expect(m.device.disable).toHaveBeenCalledTimes(1);
    });

    it("lists preferences from the query, with a mandatory type checked, disabled and marked Always on", async () => {
        const wrapper = await mountPage();
        const section = bandById(wrapper, "notify-heading");

        expect(section?.textContent).toContain("New version available");
        expect(section?.textContent).toContain("Test notification");

        const mandatory = wrapper.get('input[id="notify-system.update-available"]').element as HTMLInputElement;
        expect(mandatory.disabled).toBe(true);
        expect(mandatory.checked).toBe(true);
        expect(section?.textContent).toContain("Always on");

        const optional = wrapper.get('input[id="notify-system.test"]').element as HTMLInputElement;
        expect(optional.disabled).toBe(false);
        expect(optional.checked).toBe(true);
    });

    it("saves a changed preference through the update mutation", async () => {
        const wrapper = await mountPage();

        // PrimeVue's switch writes its value on the input's change event.
        await wrapper.get('input[id="notify-system.test"]').trigger("change");

        expect(m.updatePreferences.mutate).toHaveBeenCalledWith(
            { preferences: [{ type: "system.test", enabled: false }] },
            expect.any(Object),
        );
    });

    it("marks only the row whose endpoint is this browser's", async () => {
        m.device.endpoint.value = ENDPOINT_THIS;
        m.device.state.value = "on";
        m.subscriptions.data.value = [
            subscription({ id: "a", endpoint: ENDPOINT_THIS, deviceLabel: "Chrome on Windows" }),
            subscription({ id: "b", endpoint: ENDPOINT_OTHER, deviceLabel: "Safari on iPhone" }),
        ];
        const wrapper = await mountPage();
        const section = bandById(wrapper, "devices-heading");

        expect(section?.textContent).toContain("Chrome on Windows");
        expect(section?.textContent).toContain("Safari on iPhone");
        expect(section?.textContent?.split("This device").length).toBe(2);
    });

    it("shows when each device last delivered, or that it was not used yet", async () => {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        m.subscriptions.data.value = [
            subscription({ id: "a", deviceLabel: "Chrome on Windows", lastAcceptedAt: twoHoursAgo }),
            subscription({ id: "b", endpoint: ENDPOINT_THIS, deviceLabel: "Safari on iPhone", lastAcceptedAt: null }),
        ];
        const wrapper = await mountPage();
        const section = bandById(wrapper, "devices-heading");

        expect(section?.textContent).toContain("Last delivered 2 hours ago");
        expect(section?.textContent).toContain("Not used yet");
    });

    it("shows an empty state when no devices are registered", async () => {
        const wrapper = await mountPage();

        expect(pageText(wrapper)).toContain("No devices yet.");
    });

    it("hides developer options without the devtools flag", async () => {
        const wrapper = await mountPage();

        expect(wrapper.text()).not.toContain("Developer options");
        expect(buttonLabelled(wrapper, "Send test notification")).toBeNull();
    });

    it("shows developer options with the devtools flag, and sends a test notification", async () => {
        m.devtools.value = true;
        const wrapper = await mountPage();

        expect(wrapper.text()).toContain("Developer options");
        await buttonLabelled(wrapper, "Send test notification")?.trigger("click");
        expect(m.sendTest.mutate).toHaveBeenCalledTimes(1);
    });

    it("toasts accepted of sent after a test notification", async () => {
        m.devtools.value = true;
        const wrapper = await mountPage();

        await buttonLabelled(wrapper, "Send test notification")?.trigger("click");
        const [, handlers] = m.sendTest.mutate.mock.calls[0] as unknown as [
            unknown,
            { onSuccess: (result: { sent: number; accepted: number }) => void },
        ];
        handlers.onSuccess({ sent: 3, accepted: 2 });

        expect(m.toastAdd).toHaveBeenCalledWith(expect.objectContaining({ detail: "2 of 3 accepted" }));
    });

    it("explains the throttle when the test endpoint returns 429", async () => {
        m.devtools.value = true;
        const wrapper = await mountPage();

        await buttonLabelled(wrapper, "Send test notification")?.trigger("click");
        const [, handlers] = m.sendTest.mutate.mock.calls[0] as unknown as [
            unknown,
            { onError: (error: unknown) => void },
        ];
        handlers.onError({ response: { status: 429, data: { message: "Throttled" } } });

        expect(m.toastAdd).toHaveBeenCalledWith(
            expect.objectContaining({ detail: "Too many test notifications, try again in a minute" }),
        );
    });

    it("shows the demo note and disables the controls for the demo account", async () => {
        useAuthStore().user = { ...baseUser, isDemo: true };
        m.devtools.value = true;
        m.subscriptions.data.value = [subscription({ id: "a" })];
        const wrapper = await mountPage();

        expect(pageText(wrapper)).toContain("The demo account can't turn on notifications.");
        expect(buttonLabelled(wrapper, "Turn on")?.attributes("disabled")).toBeDefined();
        expect(buttonLabelled(wrapper, "Send test notification")?.attributes("disabled")).toBeDefined();
        expect(wrapper.get('input[id="notify-system.test"]').attributes("disabled")).toBeDefined();
        expect(wrapper.get('button[aria-label="Remove Chrome on Windows"]').attributes("disabled")).toBeDefined();
    });
});
