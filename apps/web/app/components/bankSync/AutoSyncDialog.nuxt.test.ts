import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { computed, nextTick, ref } from "vue";
import type { VueWrapper } from "@vue/test-utils";
import type { IAutoSyncStatus } from "@badger/types";
import type { AutoSync } from "../../composables/bankSync/useAutoSync";
import AutoSyncDialog from "./AutoSyncDialog.vue";

const api = vi.hoisted(() => ({ getSyncPasskeys: vi.fn(async () => []) }));
const unlock = vi.hoisted(() => vi.fn(async () => "1234"));

vi.mock("../../composables/useApiClient", () => ({ useApiClient: () => api }));
// Passkeys are off here, so the dialog asks for the PIN.
vi.mock("../../composables/bankSync/useSyncUnlock", () => ({
    useSyncUnlock: () => ({ isWebAuthnAvailable: () => false, unlock }),
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
        });
    });
});
