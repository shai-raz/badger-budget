import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import type { IAuthUser, IAutoSyncStatus, INotificationPreference, IPushSubscription } from "@badger/types";
import type { PushDeviceState } from "~/utils/push/pushState";
import { useAuthStore } from "~/stores/auth";
import { describeDevice } from "~/utils/deviceLabel";
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
        autoSync: {
            status: ref<IAutoSyncStatus | null>(null),
            holdsGrant: ref(false),
            refresh: vi.fn(() => Promise.resolve()),
            disable: vi.fn(() => Promise.resolve()),
        },
        toastAdd: vi.fn(),
    };
});

const confirmRequire = vi.hoisted(() => vi.fn());

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
vi.mock("../../composables/bankSync/useAutoSync", () => ({ useAutoSync: () => m.autoSync }));
vi.mock("primevue/useconfirm", () => ({ useConfirm: () => ({ require: confirmRequire }) }));

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
    {
        type: "auto-sync.result",
        label: "Auto-sync",
        description: "Sync’s result, and a reminder to keep auto-sync on.",
        enabled: true,
        mandatory: true,
    },
];

const autoSyncStatus: IAutoSyncStatus = {
    id: "auto-sync-1",
    deviceLabel: "Chrome on Windows",
    pushSubscriptionId: "sub-1",
    durationDays: 30,
    expiresAt: "2026-12-12T00:00:00.000Z",
    intervalUnit: "days",
    intervalCount: 1,
    windowStartMinute: null,
    windowEndMinute: null,
    runAtMinute: 480,
    timeZone: "UTC",
    nextRunAt: "2026-11-13T08:00:00.000Z",
    lastRunAt: null,
    missedRuns: 0,
    unreachable: false,
    createdAt: "2026-11-12T00:00:00.000Z",
    includedConnections: [],
    notIncludedConnections: [],
};

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
    m.autoSync.status.value = null;
    m.autoSync.holdsGrant.value = false;
    m.autoSync.refresh.mockImplementation(() => Promise.resolve());
    m.autoSync.disable.mockImplementation(() => Promise.resolve());
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

const pushSwitch = (wrapper: VueWrapper) => wrapper.get('input[id="push-notifications"]').element as HTMLInputElement;

// Opens a device's ⋮ menu and returns its "Remove device" link, which PrimeVue renders outside the page.
async function openRemoveItem(wrapper: VueWrapper, deviceLabel: string): Promise<HTMLElement | null | undefined> {
    await wrapper.get(`button[aria-label="Actions for ${deviceLabel}"]`).trigger("click");
    await flushPromises();
    const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
        el.textContent?.includes("Remove device"),
    );
    return item?.querySelector<HTMLElement>(".p-menu-item-link");
}

describe("settings notifications page", () => {
    describe("this device", () => {
        it.each<[PushDeviceState, string]>([
            ["unsupported", "This browser can't receive push notifications."],
            ["ios-install", "Add Badger to your Home Screen first"],
            ["denied", "Notifications are blocked for this site"],
        ])("explains the %s state and disables the switch", async (state, copy) => {
            m.device.state.value = state;
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain(copy);
            expect(pushSwitch(wrapper).disabled).toBe(true);
        });

        it("lists the iPhone steps to add Badger to the Home Screen", async () => {
            m.device.state.value = "ios-install";
            const wrapper = await mountPage();

            const steps = Array.from(wrapper.findAll("li")).map((item) => item.text());
            expect(steps).toEqual([
                "In Safari, tap the Share button.",
                "Choose Add to Home Screen.",
                "Open Badger from the new icon and come back here.",
            ]);
        });

        it("turns notifications on through enable when the switch is turned on", async () => {
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain("Turn on to get notifications even when Badger is closed.");
            expect(pushSwitch(wrapper).disabled).toBe(false);
            expect(pushSwitch(wrapper).checked).toBe(false);
            await wrapper.get('input[id="push-notifications"]').trigger("change");
            expect(m.device.enable).toHaveBeenCalledTimes(1);
        });

        it("turns notifications off through disable when the switch is turned off", async () => {
            m.device.state.value = "on";
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain("You get notifications even when Badger is closed.");
            expect(pushSwitch(wrapper).checked).toBe(true);
            await wrapper.get('input[id="push-notifications"]').trigger("change");
            expect(m.device.disable).toHaveBeenCalledTimes(1);
        });

        it("puts the switch back when turning on leaves the device off", async () => {
            const wrapper = await mountPage();

            await wrapper.get('input[id="push-notifications"]').trigger("change");
            await flushPromises();

            expect(m.device.enable).toHaveBeenCalledTimes(1);
            expect(pushSwitch(wrapper).checked).toBe(false);
        });

        it("puts the switch back when turning on is blocked by the browser", async () => {
            m.device.enable.mockImplementationOnce(() => {
                m.device.state.value = "denied";
                return Promise.resolve();
            });
            const wrapper = await mountPage();

            await wrapper.get('input[id="push-notifications"]').trigger("change");
            await flushPromises();

            expect(pageText(wrapper)).toContain("Blocked by your browser.");
            expect(pushSwitch(wrapper).checked).toBe(false);
        });

        it("puts the switch back when turning on fails", async () => {
            // The composable records a failed attempt in `error` and leaves the state where it was.
            m.device.enable.mockImplementationOnce(() => {
                m.device.error.value = new Error("offline");
                return Promise.resolve();
            });
            const wrapper = await mountPage();

            await wrapper.get('input[id="push-notifications"]').trigger("change");
            await flushPromises();

            expect(pageText(wrapper)).toContain("Couldn't update notifications on this device.");
            expect(pushSwitch(wrapper).checked).toBe(false);
        });

        it("keeps the switch on when turning off fails", async () => {
            m.device.state.value = "on";
            m.device.disable.mockImplementationOnce(() => {
                m.device.error.value = new Error("offline");
                return Promise.resolve();
            });
            const wrapper = await mountPage();

            await wrapper.get('input[id="push-notifications"]').trigger("change");
            await flushPromises();

            expect(pageText(wrapper)).toContain("Couldn't update notifications on this device.");
            expect(pushSwitch(wrapper).checked).toBe(true);
        });

        it("labels the band with this browser's device name, except when unsupported", async () => {
            const wrapper = await mountPage();
            const label = describeDevice(navigator.userAgent, navigator.maxTouchPoints);
            expect(bandById(wrapper, "this-device-heading")?.textContent).toContain(label);

            m.device.state.value = "unsupported";
            await flushPromises();
            expect(bandById(wrapper, "this-device-heading")?.textContent).not.toContain(label);
        });

        it("shows the demo note and disables the switch for the demo account", async () => {
            useAuthStore().user = { ...baseUser, isDemo: true };
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain("Notifications aren't available on the demo account.");
            expect(pageText(wrapper)).toContain("Not available on the demo account.");
            expect(pushSwitch(wrapper).disabled).toBe(true);
        });

        it("shows the error message when this device could not be updated", async () => {
            m.device.error.value = new Error("boom");
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain("Couldn't update notifications on this device.");
        });
    });

    it("lists types from the query, with a mandatory type checked, disabled and marked Always on", async () => {
        const wrapper = await mountPage();
        const section = bandById(wrapper, "notify-heading");

        expect(section?.textContent).toContain("Notification types");
        expect(section?.textContent).toContain("For all your devices");
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

    describe("auto-sync entry", () => {
        it("is hidden while auto-sync is off", async () => {
            const wrapper = await mountPage();
            await flushPromises();

            expect(wrapper.find('input[id="notify-auto-sync.result"]').exists()).toBe(false);
            expect(pageText(wrapper)).not.toContain("Sync’s result, and a reminder to keep auto-sync on.");
        });

        it("is shown as an always-on entry while auto-sync is on", async () => {
            m.autoSync.status.value = autoSyncStatus;
            const wrapper = await mountPage();
            await flushPromises();

            const section = bandById(wrapper, "notify-heading");
            expect(section?.textContent).toContain("Auto-sync");
            expect(section?.textContent).toContain("Sync’s result, and a reminder to keep auto-sync on.");
            expect(section?.textContent).toContain("Always on");

            const toggle = wrapper.get('input[id="notify-auto-sync.result"]').element as HTMLInputElement;
            expect(toggle.disabled).toBe(true);
            expect(toggle.checked).toBe(true);
        });

        it("stays hidden when the auto-sync status cannot be loaded", async () => {
            m.autoSync.refresh.mockRejectedValue(new Error("offline"));
            const wrapper = await mountPage();
            await flushPromises();

            expect(wrapper.find('input[id="notify-auto-sync.result"]').exists()).toBe(false);
        });
    });

    it("saves a changed type through the update mutation", async () => {
        const wrapper = await mountPage();

        // PrimeVue's switch writes its value on the input's change event.
        await wrapper.get('input[id="notify-system.test"]').trigger("change");

        expect(m.updatePreferences.mutate).toHaveBeenCalledWith(
            { preferences: [{ type: "system.test", enabled: false }] },
            expect.any(Object),
        );
    });

    it("puts a type's switch back when its save fails", async () => {
        const wrapper = await mountPage();
        const optional = () => wrapper.get('input[id="notify-system.test"]').element as HTMLInputElement;

        await wrapper.get('input[id="notify-system.test"]').trigger("change");
        expect(optional().checked).toBe(false);

        const [, handlers] = m.updatePreferences.mutate.mock.calls[0] as unknown as [
            unknown,
            { onError: (error: unknown) => void; onSettled: () => void },
        ];
        handlers.onError(new Error("server down"));
        handlers.onSettled();
        await flushPromises();

        expect(m.toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "error" }));
        expect(optional().checked).toBe(true);
    });

    it("shows the empty copy for types when none are available", async () => {
        m.preferences.data.value = [];
        const wrapper = await mountPage();

        expect(pageText(wrapper)).toContain(
            "There are no notifications for your account yet. New ones will show up here.",
        );
    });

    describe("devices", () => {
        it.each<[number, string]>([
            [0, "None"],
            [1, "1 device"],
            [2, "2 devices"],
        ])("counts %i registered device(s) as %s", async (count, label) => {
            m.subscriptions.data.value = Array.from({ length: count }, (_, i) =>
                subscription({ id: `s${i}`, endpoint: `https://push.example/${i}` }),
            );
            const wrapper = await mountPage();

            expect(bandById(wrapper, "devices-heading")?.textContent).toContain(label);
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

        it("uses a phone icon for phones and tablets, and a desktop icon otherwise", async () => {
            m.subscriptions.data.value = [
                subscription({ id: "a", deviceLabel: "Safari on iPhone" }),
                subscription({ id: "b", endpoint: ENDPOINT_THIS, deviceLabel: "Chrome on Windows" }),
            ];
            const wrapper = await mountPage();
            const section = bandById(wrapper, "devices-heading");

            expect(section?.querySelector(".pi-mobile")).not.toBeNull();
            expect(section?.querySelector(".pi-desktop")).not.toBeNull();
        });

        it("shows when each device last notified, or that it has not yet", async () => {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            m.subscriptions.data.value = [
                subscription({ id: "a", deviceLabel: "Chrome on Windows", lastAcceptedAt: twoHoursAgo }),
                subscription({
                    id: "b",
                    endpoint: ENDPOINT_THIS,
                    deviceLabel: "Safari on iPhone",
                    lastAcceptedAt: null,
                }),
            ];
            const wrapper = await mountPage();
            const section = bandById(wrapper, "devices-heading");

            expect(section?.textContent).toContain("Last notification 2 hours ago");
            expect(section?.textContent).toContain("No notifications yet");
        });

        it("shows an empty state when no devices are registered", async () => {
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain(
                "No devices get notifications yet. Turn on push notifications above to add this one.",
            );
        });

        it("removes another device through the mutation without unsubscribing this browser", async () => {
            m.subscriptions.data.value = [subscription({ id: "sub-2", deviceLabel: "Chrome on Windows" })];
            const wrapper = await mountPage();

            const remove = await openRemoveItem(wrapper, "Chrome on Windows");
            remove?.click();
            await flushPromises();

            expect(m.removeSubscription.mutateAsync).toHaveBeenCalledWith("sub-2");
            expect(m.device.disable).not.toHaveBeenCalled();
        });

        it("removes this device through the mutation and then unsubscribes the browser", async () => {
            m.device.endpoint.value = ENDPOINT_THIS;
            m.device.state.value = "on";
            m.subscriptions.data.value = [
                subscription({ id: "sub-1", endpoint: ENDPOINT_THIS, deviceLabel: "Chrome on Windows" }),
            ];
            const wrapper = await mountPage();

            const remove = await openRemoveItem(wrapper, "Chrome on Windows");
            remove?.click();
            await flushPromises();

            expect(m.removeSubscription.mutateAsync).toHaveBeenCalledWith("sub-1");
            expect(m.device.disable).toHaveBeenCalledTimes(1);
        });

        it("toasts an error and leaves the browser subscribed when removal fails", async () => {
            m.device.endpoint.value = ENDPOINT_THIS;
            m.device.state.value = "on";
            m.subscriptions.data.value = [
                subscription({ id: "sub-1", endpoint: ENDPOINT_THIS, deviceLabel: "Chrome on Windows" }),
            ];
            m.removeSubscription.mutateAsync.mockRejectedValueOnce(new Error("server down"));
            const wrapper = await mountPage();

            const remove = await openRemoveItem(wrapper, "Chrome on Windows");
            remove?.click();
            await flushPromises();

            expect(m.toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "error" }));
            expect(m.device.disable).not.toHaveBeenCalled();
        });
    });

    describe("turning off auto-sync", () => {
        type ConfirmOptions = { accept?: () => void; reject?: () => void };
        const confirmOptions = () => confirmRequire.mock.calls[0]?.[0] as ConfirmOptions | undefined;

        // This device is on and holds the auto-sync grant, so switching notifications off has to ask first.
        function setUpGrantHolder() {
            m.device.state.value = "on";
            m.autoSync.status.value = autoSyncStatus;
            m.autoSync.holdsGrant.value = true;
        }

        async function switchOff(wrapper: VueWrapper) {
            await wrapper.get('input[id="push-notifications"]').trigger("change");
            await flushPromises();
        }

        it("asks before turning off notifications on the device that holds auto-sync", async () => {
            setUpGrantHolder();
            const wrapper = await mountPage();

            await switchOff(wrapper);

            expect(confirmRequire).toHaveBeenCalledTimes(1);
            expect(confirmRequire).toHaveBeenCalledWith(
                expect.objectContaining({
                    header: "Turn off notifications?",
                    message: "This also turns off auto-sync.",
                    acceptLabel: "Turn off",
                    rejectLabel: "Cancel",
                }),
            );
            expect(m.autoSync.disable).not.toHaveBeenCalled();
            expect(m.device.disable).not.toHaveBeenCalled();
        });

        it("turns auto-sync off before notifications when the turn-off is accepted", async () => {
            setUpGrantHolder();
            const wrapper = await mountPage();
            await switchOff(wrapper);

            confirmOptions()?.accept?.();
            await flushPromises();

            expect(m.autoSync.disable).toHaveBeenCalledTimes(1);
            expect(m.device.disable).toHaveBeenCalledTimes(1);
            expect(m.autoSync.disable.mock.invocationCallOrder[0]).toBeLessThan(
                m.device.disable.mock.invocationCallOrder[0] ?? Infinity,
            );
        });

        it("leaves notifications on when the turn-off is cancelled", async () => {
            setUpGrantHolder();
            const wrapper = await mountPage();
            await switchOff(wrapper);

            confirmOptions()?.reject?.();
            await flushPromises();

            expect(m.autoSync.disable).not.toHaveBeenCalled();
            expect(m.device.disable).not.toHaveBeenCalled();
            expect(pushSwitch(wrapper).checked).toBe(true);
        });

        it("shows an error and leaves notifications on when auto-sync cannot be turned off", async () => {
            setUpGrantHolder();
            m.autoSync.disable.mockRejectedValueOnce(new Error("offline"));
            const wrapper = await mountPage();
            await switchOff(wrapper);

            confirmOptions()?.accept?.();
            await flushPromises();

            expect(m.toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "error" }));
            expect(m.device.disable).not.toHaveBeenCalled();
            expect(pushSwitch(wrapper).checked).toBe(true);
        });

        it("turns notifications off without asking when this device does not hold auto-sync", async () => {
            setUpGrantHolder();
            m.autoSync.holdsGrant.value = false;
            const wrapper = await mountPage();

            await switchOff(wrapper);

            expect(confirmRequire).not.toHaveBeenCalled();
            expect(m.device.disable).toHaveBeenCalledTimes(1);
        });

        it("asks before removing this device when it holds auto-sync, and turns auto-sync off first", async () => {
            setUpGrantHolder();
            m.device.endpoint.value = ENDPOINT_THIS;
            m.subscriptions.data.value = [
                subscription({ id: "sub-1", endpoint: ENDPOINT_THIS, deviceLabel: "Chrome on Windows" }),
            ];
            const wrapper = await mountPage();

            const remove = await openRemoveItem(wrapper, "Chrome on Windows");
            remove?.click();
            await flushPromises();

            expect(confirmRequire).toHaveBeenCalledWith(expect.objectContaining({ header: "Turn off notifications?" }));
            expect(m.removeSubscription.mutateAsync).not.toHaveBeenCalled();

            confirmOptions()?.accept?.();
            await flushPromises();

            expect(m.autoSync.disable.mock.invocationCallOrder[0]).toBeLessThan(
                m.removeSubscription.mutateAsync.mock.invocationCallOrder[0] ?? Infinity,
            );
            expect(m.removeSubscription.mutateAsync).toHaveBeenCalledWith("sub-1");
        });

        it("removes another device directly without asking", async () => {
            setUpGrantHolder();
            m.subscriptions.data.value = [subscription({ id: "sub-2", deviceLabel: "Chrome on Windows" })];
            const wrapper = await mountPage();

            const remove = await openRemoveItem(wrapper, "Chrome on Windows");
            remove?.click();
            await flushPromises();

            expect(confirmRequire).not.toHaveBeenCalled();
            expect(m.autoSync.disable).not.toHaveBeenCalled();
            expect(m.removeSubscription.mutateAsync).toHaveBeenCalledWith("sub-2");
        });
    });

    describe("developer options", () => {
        it("hides developer options without the devtools flag", async () => {
            const wrapper = await mountPage();

            expect(wrapper.text()).not.toContain("Developer options");
            expect(buttonLabelled(wrapper, "Send test")).toBeNull();
        });

        it("sends a test notification and shows the result inline, not as a toast", async () => {
            m.devtools.value = true;
            m.subscriptions.data.value = [
                subscription({ id: "a" }),
                subscription({ id: "b", endpoint: ENDPOINT_THIS }),
            ];
            const wrapper = await mountPage();

            expect(bandById(wrapper, "developer-heading")?.textContent).toContain("Only in this browser");
            await buttonLabelled(wrapper, "Send test")?.trigger("click");
            expect(m.sendTest.mutate).toHaveBeenCalledTimes(1);

            const [, handlers] = m.sendTest.mutate.mock.calls[0] as unknown as [
                unknown,
                { onSuccess: (result: { sent: number; accepted: number }) => void },
            ];
            handlers.onSuccess({ sent: 2, accepted: 2 });
            await flushPromises();

            expect(pageText(wrapper)).toContain("Sent to 2 devices. Check your notifications.");
            expect(m.toastAdd).not.toHaveBeenCalled();
        });

        it("explains the throttle when the test endpoint returns 429", async () => {
            m.devtools.value = true;
            m.subscriptions.data.value = [subscription({ id: "a" })];
            const wrapper = await mountPage();

            await buttonLabelled(wrapper, "Send test")?.trigger("click");
            const [, handlers] = m.sendTest.mutate.mock.calls[0] as unknown as [
                unknown,
                { onError: (error: unknown) => void },
            ];
            handlers.onError({ response: { status: 429, data: { message: "Throttled" } } });

            expect(m.toastAdd).toHaveBeenCalledWith(
                expect.objectContaining({ detail: "Too many test notifications, try again in a minute" }),
            );
        });

        it("disables the test button when there are no devices", async () => {
            m.devtools.value = true;
            const wrapper = await mountPage();

            expect(buttonLabelled(wrapper, "Send test")?.attributes("disabled")).toBeDefined();
        });

        it("disables the controls for the demo account", async () => {
            useAuthStore().user = { ...baseUser, isDemo: true };
            m.devtools.value = true;
            m.subscriptions.data.value = [subscription({ id: "a", deviceLabel: "Chrome on Windows" })];
            const wrapper = await mountPage();

            expect(buttonLabelled(wrapper, "Send test")?.attributes("disabled")).toBeDefined();
            expect(wrapper.get('input[id="notify-system.test"]').attributes("disabled")).toBeDefined();
            expect(
                wrapper.get('button[aria-label="Actions for Chrome on Windows"]').attributes("disabled"),
            ).toBeDefined();
        });
    });
});
