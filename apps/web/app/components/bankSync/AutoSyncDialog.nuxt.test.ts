import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { computed, nextTick, ref } from "vue";
import type { VueWrapper } from "@vue/test-utils";
import Select from "primevue/select";
import type { IAutoSyncStatus } from "@badger/types";
import type { AutoSync } from "../../composables/bankSync/useAutoSync";
import { bankSyncKeys } from "../../composables/bankSync/useBankSync";
import { SyncUnlockError } from "../../utils/syncPasskeyWebAuthn";
import AutoSyncDialog from "./AutoSyncDialog.vue";

const api = vi.hoisted(() => ({
    getSyncPasskeys: vi.fn(async () => []),
    getSyncPinStatus: vi.fn(async () => ({ hasPinSet: true })),
}));
const unlock = vi.hoisted(() => vi.fn(async () => "1234"));
// Passkeys are off unless a test turns WebAuthn on, so the dialog asks for the PIN.
const webAuthn = vi.hoisted(() => ({ available: false }));
const queryClient = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));

vi.mock("../../composables/useApiClient", () => ({ useApiClient: () => api }));
vi.mock("../../composables/bankSync/useSyncUnlock", () => ({
    useSyncUnlock: () => ({ isWebAuthnAvailable: () => webAuthn.available, unlock }),
}));
vi.mock("@tanstack/vue-query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@tanstack/vue-query")>()),
    useQueryClient: () => queryClient,
}));

const status = (overrides: Partial<IAutoSyncStatus>): IAutoSyncStatus =>
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

const hourly = status({});

function fakeAutoSync(current: IAutoSyncStatus | null): AutoSync {
    return {
        status: ref(current),
        loading: ref(false),
        holdsGrant: computed(() => current !== null),
        refresh: vi.fn(),
        ensurePushSubscriptionId: vi.fn(async () => "sub-1"),
        enable: vi.fn(async () => current as IAutoSyncStatus),
        updateSchedule: vi.fn(async () => current as IAutoSyncStatus),
        disable: vi.fn(),
        renew: vi.fn(),
    } as unknown as AutoSync;
}

const body = () => document.body.textContent?.replace(/\s+/g, " ") ?? "";
const buttonWith = (label: string) =>
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === label) ?? null;

let wrapper: VueWrapper | null = null;

async function mountDialog(props: { mode: "enable" | "schedule"; current: IAutoSyncStatus | null }) {
    const autoSync = fakeAutoSync(props.current);
    wrapper = await mountSuspended(AutoSyncDialog, {
        props: { visible: true, mode: props.mode, autoSync },
    });
    await nextTick();
    return autoSync;
}

beforeEach(() => {
    vi.clearAllMocks();
    api.getSyncPasskeys.mockResolvedValue([]);
    webAuthn.available = false;
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

describe("AutoSyncDialog schedule", () => {
    it("shows the stored preset and the hourly window for a preset value", async () => {
        await mountDialog({ mode: "schedule", current: hourly });
        expect(body()).toContain("Every 4 hours");
        expect(body()).toContain("Only between");
        expect(body()).toContain("About 4 syncs a day.");
    });

    it("blocks a schedule that the grant's 7 day duration cannot cover, and says why", async () => {
        await mountDialog({ mode: "schedule", current: status({ durationDays: 7 }) });
        wrapper!.findAllComponents(Select)[0]!.vm.$emit("update:modelValue", "7d");
        await nextTick();
        expect(body()).toContain("Auto-sync is kept on for 7 days, too short for this schedule.");
        expect(buttonWith("Save")?.disabled).toBe(true);
    });

    it("allows a schedule that the grant's 7 day duration covers", async () => {
        await mountDialog({ mode: "schedule", current: status({ durationDays: 7 }) });
        wrapper!.findAllComponents(Select)[0]!.vm.$emit("update:modelValue", "3d");
        await nextTick();
        expect(body()).not.toContain("too short for this schedule");
        expect(buttonWith("Save")?.disabled).toBe(false);
    });

    it("shows Custom with the number and unit for 5 hours", async () => {
        await mountDialog({ mode: "schedule", current: status({ intervalCount: 5 }) });
        expect(body()).toContain("Custom…");
        expect(body()).toContain("Every");
        expect(Array.from(document.querySelectorAll("input")).some((input) => input.value === "5")).toBe(true);
        expect(body()).toContain("hours");
    });

    it("shows the run time and first sync for a daily schedule", async () => {
        await mountDialog({
            mode: "schedule",
            current: status({
                intervalUnit: "days",
                intervalCount: 3,
                windowStartMinute: null,
                windowEndMinute: null,
                runAtMinute: 480,
            }),
        });
        expect(body()).toContain("At");
        expect(body()).toContain("First sync");
        expect(body()).toContain("08:00");
        expect(body()).not.toContain("Only between");
    });

    it("explains the hour limit and disables save above 23 hours", async () => {
        await mountDialog({ mode: "schedule", current: status({ intervalCount: 24 }) });
        expect(body()).toContain("Up to 23 hours. For more, use days.");
        expect(buttonWith("Save")?.disabled).toBe(true);
    });

    it("disables the 7 day duration for an every 5 days schedule", async () => {
        await mountDialog({
            mode: "enable",
            current: status({
                intervalUnit: "days",
                intervalCount: 5,
                windowStartMinute: null,
                windowEndMinute: null,
                runAtMinute: 420,
            }),
        });
        const sevenDays = Array.from(document.querySelectorAll("*")).find(
            (el) => el.children.length === 0 && el.textContent?.trim() === "7 days",
        );
        expect(sevenDays).toBeTruthy();
        const disabled = sevenDays?.closest('[disabled],[aria-disabled="true"],[data-p-disabled="true"]');
        expect(disabled).not.toBeNull();
    });
});

const passkeyRow = { id: "pk-1" };

async function mountWithPasskey() {
    webAuthn.available = true;
    api.getSyncPasskeys.mockResolvedValue([passkeyRow] as never);
    api.getSyncPinStatus.mockResolvedValue({ hasPinSet: true } as never);
    const autoSync = await mountDialog({ mode: "enable", current: null });
    await vi.waitFor(() => expect(buttonWith("Use PIN instead")).not.toBeNull());
    return autoSync;
}

const pinInput = () => document.querySelector<HTMLInputElement>('input[placeholder="Enter your sync PIN"]');

describe("AutoSyncDialog enable with a passkey", () => {
    it("takes the push subscription before the passkey unlock, then turns auto-sync on with the unlocked PIN", async () => {
        const autoSync = await mountWithPasskey();
        const order: string[] = [];
        vi.mocked(autoSync.ensurePushSubscriptionId).mockImplementation(async () => {
            order.push("push");
            return "sub-1";
        });
        unlock.mockImplementationOnce(async () => {
            order.push("unlock");
            return "5678";
        });

        buttonWith("Unlock and turn on")!.click();
        await vi.waitFor(() => expect(autoSync.enable).toHaveBeenCalledTimes(1));

        expect(order).toEqual(["push", "unlock"]);
        expect(autoSync.enable).toHaveBeenCalledWith({
            pin: "5678",
            schedule: { intervalUnit: "hours", intervalCount: 4, windowStartMinute: 420, windowEndMinute: 1320 },
            durationDays: 30,
            pushSubscriptionId: "sub-1",
        });
    });

    it("shows the reason and the PIN field when the passkey unlock is cancelled", async () => {
        const autoSync = await mountWithPasskey();
        unlock.mockRejectedValueOnce(new SyncUnlockError("cancelled"));

        buttonWith("Unlock and turn on")!.click();
        await vi.waitFor(() => expect(body()).toContain("Passkey cancelled or not available on this device."));

        expect(pinInput()).toBeTruthy();
        expect(autoSync.enable).not.toHaveBeenCalled();
    });

    it("refetches the passkeys when the stored passkey no longer unlocks", async () => {
        const autoSync = await mountWithPasskey();
        unlock.mockResolvedValueOnce("5678");
        vi.mocked(autoSync.enable).mockRejectedValueOnce(
            Object.assign(new Error("Unauthorized"), { response: { status: 401 } }),
        );

        buttonWith("Unlock and turn on")!.click();
        await vi.waitFor(() => expect(body()).toContain("Your passkey unlock is out of date. Enter your PIN."));

        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: bankSyncKeys.passkeys() });
        expect(pinInput()).toBeTruthy();
    });
});

describe("AutoSyncDialog enable", () => {
    it("asks for the PIN and the keep-on duration, and shows the notification line", async () => {
        await mountDialog({ mode: "enable", current: null });
        expect(body()).toContain("Keep on for");
        expect(body()).toContain("Next, allow notifications when asked.");
        expect(body()).toContain("Sync PIN");
        expect(buttonWith("Unlock and turn on")?.disabled).toBe(true);
    });

    it("turns auto-sync on with the PIN, the default schedule and 30 days", async () => {
        const autoSync = await mountDialog({ mode: "enable", current: null });
        const pinInput = document.querySelector<HTMLInputElement>('input[placeholder="Enter your sync PIN"]');
        expect(pinInput).toBeTruthy();
        pinInput!.value = "1234";
        pinInput!.dispatchEvent(new Event("input"));
        await nextTick();

        buttonWith("Unlock and turn on")!.click();
        await vi.waitFor(() => expect(autoSync.enable).toHaveBeenCalledTimes(1));
        expect(autoSync.enable).toHaveBeenCalledWith({
            pin: "1234",
            schedule: { intervalUnit: "hours", intervalCount: 4, windowStartMinute: 420, windowEndMinute: 1320 },
            durationDays: 30,
            pushSubscriptionId: "sub-1",
        });
    });
});
