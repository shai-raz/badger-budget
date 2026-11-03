import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { useNuxtApp } from "#app";
import type { VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import type { IScraperConnectionResponse } from "@badger/types";
import BankConnections from "./bank-connections.vue";

const api = vi.hoisted(() => ({
    getScraperConnections: vi.fn(),
    updateScraperConnection: vi.fn(),
}));
const toastAdd = vi.hoisted(() => vi.fn());

// The real queries and mutations run against this fake API; the layout-provided sync flow and toast are stubbed.
vi.mock("../composables/useApiClient", () => ({ useApiClient: () => api }));
vi.mock("../composables/bankSync/useBankSyncFlow", () => ({
    useBankSyncFlow: () => ({ busy: ref(false), requestSync: vi.fn() }),
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock("primevue/useconfirm", () => ({ useConfirm: () => ({ require: vi.fn() }) }));

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

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

const toggleSwitch = (wrapper: VueWrapper) => wrapper.get('[role="switch"]');

beforeEach(() => {
    vi.clearAllMocks();
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
