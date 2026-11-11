import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { useNuxtApp } from "#app";
import type { VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import type { IScraperConnectionResponse } from "@badger/types";
import BankConnections from "./index.vue";

const api = vi.hoisted(() => ({
    getScraperConnections: vi.fn(),
    updateScraperConnection: vi.fn(),
    getAutoSync: vi.fn(),
    getSyncPasskeys: vi.fn(async () => []),
}));
const toastAdd = vi.hoisted(() => vi.fn());
// Connection id -> state in the active sync run; the flow's connectionSyncState reads it.
const syncStates = await vi.hoisted(async () => {
    const { ref: vueRef } = await import("vue");
    return vueRef<Record<string, "pending" | "running">>({});
});

// The real queries and mutations run against this fake API; the layout-provided sync flow and toast are stubbed.
vi.mock("../../composables/useApiClient", () => ({ useApiClient: () => api }));
vi.mock("../../composables/bankSync/useBankSyncFlow", () => ({
    useBankSyncFlow: () => ({
        busy: ref(false),
        requestSync: vi.fn(),
        connectionSyncState: (id: string) => syncStates.value[id] ?? null,
    }),
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock("primevue/useconfirm", () => ({ useConfirm: () => ({ require: vi.fn() }) }));
// The auto-sync status comes from the API; the device key store (IndexedDB) is not needed here.
vi.mock("../../utils/push/autoSyncKeyStore", () => ({
    loadAutoSyncKey: vi.fn(async () => null),
    saveAutoSyncKey: vi.fn(),
    clearAutoSyncKey: vi.fn(),
}));

const connection = (isActive: boolean): IScraperConnectionResponse => ({
    id: "c1",
    companyId: "visaCal",
    displayName: "Visa Cal",
    scrapeLookbackDays: 30,
    isActive,
    lastSyncedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    latestJob: null,
});

// c1 has a failed latest run, so its failure strip would show when it is not syncing.
const failedConnection: IScraperConnectionResponse = {
    ...connection(true),
    latestJob: {
        syncJobId: "run-1",
        status: "failed",
        errorCode: "INVALID_PASSWORD",
        finishedAt: new Date("2026-03-01T10:01:00Z"),
    },
};
const otherConnection: IScraperConnectionResponse = {
    ...connection(true),
    id: "c2",
    companyId: "hapoalim",
    displayName: "Hapoalim",
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

const toggleSwitch = (wrapper: VueWrapper) => wrapper.get('[role="switch"]');

// The ⋮ menu is a popup that teleports to the body, so its items are read from document.body.
const menuItem = (label: string) =>
    Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
        el.textContent?.includes(label),
    );
const isMenuItemDisabled = (label: string) => {
    const item = menuItem(label);
    return item?.getAttribute("aria-disabled") === "true" || item?.classList.contains("p-disabled") === true;
};

beforeEach(() => {
    vi.clearAllMocks();
    syncStates.value = {};
    api.getAutoSync.mockResolvedValue({ autoSync: null });
    // The query client is shared across mounts in this file, so each test starts from an empty cache.
    useNuxtApp().$queryClient.clear();
});

describe("bank connections page toggle", () => {
    it("shows the server's state again when the save fails", async () => {
        api.getScraperConnections.mockResolvedValue([connection(true)]);
        api.updateScraperConnection.mockRejectedValue(new Error("Network down"));
        const wrapper = await mountSuspended(BankConnections);
        await vi.waitFor(() => expect(wrapper.find('[role="switch"]').exists()).toBe(true));

        await wrapper.get('[role="switch"]').trigger("change");

        await vi.waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "error" })));
        expect(api.updateScraperConnection).toHaveBeenCalledWith("c1", { isActive: false });
        expect((toggleSwitch(wrapper).element as HTMLInputElement).checked).toBe(true);
        expect(toggleSwitch(wrapper).attributes("aria-checked")).toBe("true");
        expect(toggleSwitch(wrapper).attributes("disabled")).toBeUndefined();
    });

    it("stays disabled until the refetched list shows the saved state", async () => {
        const refetch = deferred<IScraperConnectionResponse[]>();
        api.getScraperConnections.mockResolvedValueOnce([connection(false)]).mockImplementation(() => refetch.promise);
        api.updateScraperConnection.mockResolvedValue(connection(true));
        const wrapper = await mountSuspended(BankConnections);
        await vi.waitFor(() => expect(wrapper.find('[role="switch"]').exists()).toBe(true));

        await wrapper.get('[role="switch"]').trigger("change");

        await vi.waitFor(() => expect(api.updateScraperConnection).toHaveBeenCalledWith("c1", { isActive: true }));
        await vi.waitFor(() => expect(api.getScraperConnections.mock.calls.length).toBeGreaterThanOrEqual(2));
        // The save has resolved but the list has not refetched: the switch must not accept another click yet.
        expect(toggleSwitch(wrapper).attributes("disabled")).toBeDefined();
        expect(toastAdd).not.toHaveBeenCalled();

        refetch.resolve([connection(true)]);

        await vi.waitFor(() => expect(toggleSwitch(wrapper).attributes("disabled")).toBeUndefined());
        expect(toggleSwitch(wrapper).attributes("aria-checked")).toBe("true");
        expect(toastAdd).not.toHaveBeenCalled();
    });
});

describe("bank connections page sync state", () => {
    it("locks a running connection's switch and hides its failure strip, leaving the others alone", async () => {
        api.getScraperConnections.mockResolvedValue([failedConnection, otherConnection]);
        syncStates.value = { c1: "running" };
        const wrapper = await mountSuspended(BankConnections);
        await vi.waitFor(() => expect(wrapper.findAll('[role="switch"]')).toHaveLength(2));

        const [running, other] = wrapper.findAll('[role="switch"]');
        expect(running?.attributes("disabled")).toBeDefined();
        expect(other?.attributes("disabled")).toBeUndefined();
        expect(wrapper.text()).toContain("Visa Cal · Syncing…");
        expect(wrapper.text()).not.toContain("Wrong username or password");
    });

    it("shows a queued connection as waiting to sync", async () => {
        api.getScraperConnections.mockResolvedValue([failedConnection]);
        syncStates.value = { c1: "pending" };
        const wrapper = await mountSuspended(BankConnections);
        await vi.waitFor(() => expect(wrapper.find('[role="switch"]').exists()).toBe(true));

        expect(wrapper.text()).toContain("Visa Cal · Waiting to sync");
        expect(wrapper.text()).not.toContain("Wrong username or password");
    });

    it("disables Delete but not Edit in a running connection's menu, and restores both when the sync ends", async () => {
        api.getScraperConnections.mockResolvedValue([failedConnection]);
        syncStates.value = { c1: "running" };
        const wrapper = await mountSuspended(BankConnections);
        await vi.waitFor(() => expect(wrapper.find('[role="switch"]').exists()).toBe(true));

        await wrapper.get('[aria-label="Connection actions"]').trigger("click");

        await vi.waitFor(() => expect(menuItem("Delete")).toBeDefined());
        expect(isMenuItemDisabled("Delete")).toBe(true);
        expect(isMenuItemDisabled("Edit")).toBe(false);

        syncStates.value = {};

        await vi.waitFor(() => expect(isMenuItemDisabled("Delete")).toBe(false));
        expect(wrapper.text()).toContain("Wrong username or password");
        expect(toggleSwitch(wrapper).attributes("disabled")).toBeUndefined();
    });
});

describe("bank connections page auto-sync", () => {
    it("tags only the connections that are not in auto-sync", async () => {
        api.getScraperConnections.mockResolvedValue([connection(true), otherConnection]);
        api.getAutoSync.mockResolvedValue({
            autoSync: {
                id: "grant-1",
                intervalUnit: "hours",
                intervalCount: 4,
                windowStartMinute: 420,
                windowEndMinute: 1320,
                runAtMinute: null,
                timeZone: "Europe/London",
                deviceLabel: "Safari on iPhone",
                durationDays: 30,
                expiresAt: "2026-12-12T00:00:00.000Z",
                nextRunAt: "2026-11-12T13:00:00.000Z",
                lastRunAt: null,
                missedRuns: 0,
                unreachable: false,
                createdAt: "2026-11-12T00:00:00.000Z",
                includedConnections: [{ id: "c1", displayName: "Visa Cal" }],
                notIncludedConnections: [{ id: "c2", displayName: "Hapoalim" }],
            },
        });
        const wrapper = await mountSuspended(BankConnections);
        await vi.waitFor(() => expect(wrapper.text()).toContain("Not in auto-sync"));
        expect(wrapper.text()).toContain("Joins on your next unlock");
        expect(wrapper.text().split("Not in auto-sync").length - 1).toBe(1);
    });
});
