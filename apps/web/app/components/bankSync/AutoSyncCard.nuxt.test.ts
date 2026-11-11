import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { computed, nextTick, ref } from "vue";
import type { VueWrapper } from "@vue/test-utils";
import type { IAutoSyncStatus } from "@badger/types";
import type { AutoSync } from "../../composables/bankSync/useAutoSync";
import AutoSyncCard from "./AutoSyncCard.vue";

const api = vi.hoisted(() => ({ getSyncPasskeys: vi.fn(async () => []) }));
const confirmRequire = vi.hoisted(() => vi.fn());
const toastAdd = vi.hoisted(() => vi.fn());

vi.mock("../../composables/useApiClient", () => ({ useApiClient: () => api }));
vi.mock("../../composables/bankSync/useSyncUnlock", () => ({
    useSyncUnlock: () => ({ isWebAuthnAvailable: () => false, unlock: vi.fn() }),
}));
vi.mock("primevue/useconfirm", () => ({ useConfirm: () => ({ require: confirmRequire }) }));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));

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
        renew: vi.fn(),
    } as unknown as AutoSync;
}

const text = (wrapper: VueWrapper) => wrapper.text().replace(/\s+/g, " ").trim();
const buttonIn = (wrapper: VueWrapper, label: string) =>
    wrapper.findAll("button").find((b) => b.text().trim() === label);

beforeEach(() => {
    vi.clearAllMocks();
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
