import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { computed, nextTick, ref } from "vue";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import type { IAutoSyncStatus } from "@badger/types";
import type { AutoSync } from "../../composables/bankSync/useAutoSync";
import { AutoSyncError, AUTO_SYNC_ERROR_MESSAGES } from "../../composables/bankSync/useAutoSync";
import { SyncUnlockError } from "../../utils/syncPasskeyWebAuthn";
import AutoSyncCard from "./AutoSyncCard.vue";

// A PIN is set, so the passkey list loads (useSyncPasskeysQuery waits on the PIN status).
const api = vi.hoisted(() => ({
    getSyncPasskeys: vi.fn(async () => []),
    getSyncPinStatus: vi.fn(async () => ({ hasPinSet: true })),
}));
const confirmRequire = vi.hoisted(() => vi.fn());
const toastAdd = vi.hoisted(() => vi.fn());
const unlockMocks = vi.hoisted(() => ({ available: vi.fn(() => false), unlock: vi.fn(async () => "1234") }));
// The device's push state, which decides the iOS Home Screen case.
const push = await vi.hoisted(async () => {
    const { ref: vueRef } = await import("vue");
    return { state: vueRef<string>("off"), refresh: vi.fn(async () => {}) };
});

vi.mock("../../composables/useApiClient", () => ({ useApiClient: () => api }));
vi.mock("../../composables/bankSync/useSyncUnlock", () => ({
    useSyncUnlock: () => ({ isWebAuthnAvailable: unlockMocks.available, unlock: unlockMocks.unlock }),
}));
vi.mock("../../composables/notifications/usePushDevice", () => ({ usePushDevice: () => push }));
vi.mock("primevue/useconfirm", () => ({ useConfirm: () => ({ require: confirmRequire }) }));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

const status = (overrides: Partial<IAutoSyncStatus> = {}): IAutoSyncStatus =>
    ({
        id: "grant-1",
        intervalUnit: "hours",
        intervalCount: 4,
        windowStartMinute: 420,
        windowEndMinute: 1320,
        runAtMinute: null,
        timeZone: "Europe/London",
        deviceLabel: "Chrome on Windows",
        durationDays: 30,
        expiresAt: "2026-12-12T00:00:00.000Z",
        nextRunAt: "2026-11-12T13:00:00.000Z",
        lastRunAt: null,
        missedRuns: 0,
        unreachable: false,
        createdAt: "2026-11-12T00:00:00.000Z",
        includedConnections: [],
        notIncludedConnections: [],
        ...overrides,
    }) as IAutoSyncStatus;

function fakeAutoSync(current: IAutoSyncStatus | null, holdsGrant: boolean): AutoSync {
    return {
        status: ref(current),
        loading: ref(false),
        holdsGrant: computed(() => holdsGrant),
        refresh: vi.fn(),
        enable: vi.fn(async () => current as IAutoSyncStatus),
        updateSchedule: vi.fn(async () => current as IAutoSyncStatus),
        disable: vi.fn(async () => {}),
        renew: vi.fn(async () => current as IAutoSyncStatus),
    } as unknown as AutoSync;
}

const text = (wrapper: VueWrapper) => wrapper.text().replace(/\s+/g, " ").trim();
const buttonIn = (wrapper: VueWrapper, label: string) =>
    wrapper.findAll("button").find((b) => b.text().trim() === label);
const bodyText = () => document.body.textContent?.replace(/\s+/g, " ") ?? "";
// The dialog is teleported to the end of the body, so its save button is the last match.
const lastButtonWith = (label: string) =>
    Array.from(document.querySelectorAll("button"))
        .filter((b) => b.textContent?.trim() === label)
        .at(-1);

beforeEach(() => {
    vi.clearAllMocks();
    push.state.value = "off";
    unlockMocks.available.mockReturnValue(false);
    unlockMocks.unlock.mockResolvedValue("1234");
    api.getSyncPasskeys.mockResolvedValue([]);
    api.getSyncPinStatus.mockResolvedValue({ hasPinSet: true });
});

describe("AutoSyncCard", () => {
    it("offers to turn auto-sync on when it is off", async () => {
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: { autoSync: fakeAutoSync(null, false) },
        });
        expect(text(wrapper)).toContain("Sync on a schedule, even when Badger is closed.");
        expect(buttonIn(wrapper, "Turn on auto-sync")).toBeDefined();
        wrapper.unmount();
    });

    it("shows the schedule, next sync and the turn-off actions on this device", async () => {
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: { autoSync: fakeAutoSync(status(), true) },
        });
        const copy = text(wrapper);
        expect(copy).toContain("Sync automatically");
        expect(copy).toContain("From this device");
        expect(copy).toContain("Every 4 hours / 07:00–22:00");
        expect(copy).toContain("Runs from Chrome on Windows");
        expect(copy).toContain("On until");
        expect(buttonIn(wrapper, "Turn off auto-sync")).toBeDefined();
        expect(buttonIn(wrapper, "Change schedule")).toBeDefined();
        wrapper.unmount();
    });

    it("opens the schedule form from Change schedule", async () => {
        const autoSync = fakeAutoSync(status(), true);
        const wrapper = await mountSuspended(AutoSyncCard, { props: { autoSync } });
        buttonIn(wrapper, "Change schedule")!.trigger("click");
        await nextTick();
        expect(document.body.textContent).toContain("Change schedule");
        expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.trim() === "Save")).toBe(
            true,
        );
        wrapper.unmount();
    });

    it("shows the other device and offers to move auto-sync here", async () => {
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: { autoSync: fakeAutoSync(status({ deviceLabel: "Safari on iPhone" }), false) },
        });
        const copy = text(wrapper);
        expect(copy).toContain("On, from Safari on iPhone");
        expect(copy).toContain("Every 4 hours / 07:00–22:00");
        expect(buttonIn(wrapper, "Move here")).toBeDefined();
        expect(buttonIn(wrapper, "Turn off auto-sync")).toBeUndefined();
        wrapper.unmount();
    });

    it("asks before turning auto-sync off", async () => {
        const autoSync = fakeAutoSync(status(), true);
        const wrapper = await mountSuspended(AutoSyncCard, { props: { autoSync } });
        buttonIn(wrapper, "Turn off auto-sync")!.trigger("click");
        expect(confirmRequire).toHaveBeenCalledTimes(1);
        expect(autoSync.disable).not.toHaveBeenCalled();
        const options = confirmRequire.mock.calls[0]?.[0] as { accept: () => Promise<void> };
        await options.accept();
        expect(autoSync.disable).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });
});

describe("AutoSyncCard iOS outside the Home Screen", () => {
    it("explains the Home Screen install and disables turning auto-sync on", async () => {
        push.state.value = "ios-install";
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: { autoSync: fakeAutoSync(null, false) },
        });
        expect(text(wrapper)).toContain("First add Badger to your Home Screen: Share › Add to Home Screen.");
        expect(buttonIn(wrapper, "Turn on auto-sync")!.attributes("disabled")).toBeDefined();
        wrapper.unmount();
    });

    it("disables Move here on the other device", async () => {
        push.state.value = "ios-install";
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: { autoSync: fakeAutoSync(status({ deviceLabel: "Chrome on Windows" }), false) },
        });
        expect(buttonIn(wrapper, "Move here")!.attributes("disabled")).toBeDefined();
        wrapper.unmount();
    });

    it("keeps turn on enabled when the device can receive push", async () => {
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: { autoSync: fakeAutoSync(null, false) },
        });
        expect(text(wrapper)).not.toContain("Home Screen");
        expect(buttonIn(wrapper, "Turn on auto-sync")!.attributes("disabled")).toBeUndefined();
        wrapper.unmount();
    });
});

describe("AutoSyncCard unreachable device", () => {
    it("says when the other device last synced", async () => {
        const yesterdayNoon = new Date();
        yesterdayNoon.setDate(yesterdayNoon.getDate() - 1);
        yesterdayNoon.setHours(12, 0, 0, 0);
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: {
                autoSync: fakeAutoSync(
                    status({
                        deviceLabel: "Safari on iPhone",
                        unreachable: true,
                        lastRunAt: yesterdayNoon.toISOString(),
                    }),
                    false,
                ),
            },
        });
        expect(text(wrapper)).toContain("Can't reach Safari on iPhone. No sync since yesterday.");
        expect(buttonIn(wrapper, "Move here")).toBeDefined();
        wrapper.unmount();
    });

    it("measures from creation when the device has never run", async () => {
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: {
                autoSync: fakeAutoSync(
                    status({ deviceLabel: "Safari on iPhone", unreachable: true, lastRunAt: null }),
                    false,
                ),
            },
        });
        expect(text(wrapper)).toContain("Can't reach Safari on iPhone. No sync since");
        wrapper.unmount();
    });

    it("does not warn about a reachable device", async () => {
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: { autoSync: fakeAutoSync(status({ deviceLabel: "Safari on iPhone" }), false) },
        });
        expect(text(wrapper)).not.toContain("Can't reach");
        wrapper.unmount();
    });
});

describe("AutoSyncCard expiring grant", () => {
    it("shows the stop date, the days left and Keep on on this device", async () => {
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: { autoSync: fakeAutoSync(status({ expiresAt: daysFromNow(2) }), true) },
        });
        expect(text(wrapper)).toContain("Stops on");
        expect(text(wrapper)).toContain("2 days left");
        expect(buttonIn(wrapper, "Keep on")).toBeDefined();
        wrapper.unmount();
    });

    it("uses the singular for one day left", async () => {
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: { autoSync: fakeAutoSync(status({ expiresAt: daysFromNow(1) }), true) },
        });
        expect(text(wrapper)).toContain("1 day left");
        expect(text(wrapper)).not.toContain("1 days left");
        wrapper.unmount();
    });

    it("shows the stop date without Keep on on the other device", async () => {
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: {
                autoSync: fakeAutoSync(status({ deviceLabel: "Safari on iPhone", expiresAt: daysFromNow(3) }), false),
            },
        });
        expect(text(wrapper)).toContain("Stops on");
        expect(text(wrapper)).toContain("3 days left");
        expect(buttonIn(wrapper, "Keep on")).toBeUndefined();
        wrapper.unmount();
    });

    it("shows no expiry while the grant has more than three days left", async () => {
        const wrapper = await mountSuspended(AutoSyncCard, {
            props: { autoSync: fakeAutoSync(status({ expiresAt: daysFromNow(10) }), true) },
        });
        expect(text(wrapper)).not.toContain("days left");
        expect(buttonIn(wrapper, "Keep on")).toBeUndefined();
        wrapper.unmount();
    });

    it("renews the grant with the passkey when Keep on is clicked", async () => {
        unlockMocks.available.mockReturnValue(true);
        api.getSyncPasskeys.mockResolvedValue([{ credentialId: "passkey-1" }] as never);
        const autoSync = fakeAutoSync(status({ expiresAt: daysFromNow(2) }), true);
        const wrapper = await mountSuspended(AutoSyncCard, { props: { autoSync } });
        await vi.waitFor(() => expect(api.getSyncPasskeys).toHaveBeenCalled());
        await flushPromises();

        buttonIn(wrapper, "Keep on")!.trigger("click");
        await vi.waitFor(() => expect(autoSync.renew).toHaveBeenCalledWith("1234"));
        expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "success" }));
        wrapper.unmount();
    });

    it("asks for the PIN when there is no passkey, then renews with it", async () => {
        const autoSync = fakeAutoSync(status({ expiresAt: daysFromNow(2) }), true);
        const wrapper = await mountSuspended(AutoSyncCard, { props: { autoSync } });
        buttonIn(wrapper, "Keep on")!.trigger("click");
        await nextTick();
        expect(bodyText()).toContain("Keep auto-sync on");

        const pinInput = document.querySelector<HTMLInputElement>('input[placeholder="Enter your sync PIN"]');
        expect(pinInput!.id).toBe("auto-sync-keep-pin");
        pinInput!.value = "9876";
        pinInput!.dispatchEvent(new Event("input"));
        await nextTick();
        lastButtonWith("Keep on")!.click();

        await vi.waitFor(() => expect(autoSync.renew).toHaveBeenCalledWith("9876"));
        wrapper.unmount();
    });

    it("falls back to the PIN with the reason when the passkey is cancelled", async () => {
        unlockMocks.available.mockReturnValue(true);
        unlockMocks.unlock.mockRejectedValue(new SyncUnlockError("cancelled"));
        api.getSyncPasskeys.mockResolvedValue([{ credentialId: "passkey-1" }] as never);
        const autoSync = fakeAutoSync(status({ expiresAt: daysFromNow(2) }), true);
        const wrapper = await mountSuspended(AutoSyncCard, { props: { autoSync } });
        await vi.waitFor(() => expect(api.getSyncPasskeys).toHaveBeenCalled());
        await flushPromises();

        buttonIn(wrapper, "Keep on")!.trigger("click");
        await vi.waitFor(() => expect(bodyText()).toContain("Passkey cancelled or not available on this device."));
        expect(autoSync.renew).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it("tells the user when this device cannot receive notifications for the renewal", async () => {
        const autoSync = fakeAutoSync(status({ expiresAt: daysFromNow(2) }), true);
        vi.mocked(autoSync.renew).mockRejectedValue(new AutoSyncError("push-denied"));
        const wrapper = await mountSuspended(AutoSyncCard, { props: { autoSync } });
        buttonIn(wrapper, "Keep on")!.trigger("click");
        await nextTick();
        const pinInput = document.querySelector<HTMLInputElement>('input[placeholder="Enter your sync PIN"]');
        pinInput!.value = "9876";
        pinInput!.dispatchEvent(new Event("input"));
        await nextTick();
        lastButtonWith("Keep on")!.click();

        await vi.waitFor(() => expect(bodyText()).toContain(AUTO_SYNC_ERROR_MESSAGES["push-denied"]));
        wrapper.unmount();
    });
});
