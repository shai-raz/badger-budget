import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { useNuxtApp } from "#app";
import { ref } from "vue";
import type { ISyncJob, ISyncJobPage, SyncJobStatus } from "@badger/types";
import SyncHistory from "./history.vue";
import { bankSyncKeys } from "../../composables/bankSync/useBankSync";
import { useSyncRunDialog } from "../../composables/bankSync/useSyncRunDialog";

const api = vi.hoisted(() => ({
    listSyncJobs: vi.fn(),
    getScraperConnections: vi.fn(),
    getActiveSyncJob: vi.fn(),
}));
const flags = vi.hoisted(() => ({ desktop: true }));

// The real queries run against this fake API; the flow is stubbed so header Sync needs nothing from the layout.
vi.mock("../../composables/useApiClient", () => ({ useApiClient: () => api }));
vi.mock("../../composables/bankSync/useBankSyncFlow", () => ({
    useBankSyncFlow: () => ({ busy: ref(false), requestSync: vi.fn() }),
}));
vi.mock("../../composables/useIsDesktop", async () => {
    const { computed } = await import("vue");
    return { useIsDesktop: () => computed(() => flags.desktop) };
});

const run = (id: string, status: SyncJobStatus = "success"): ISyncJob => {
    const startedAt = new Date("2026-03-01T10:00:00Z");
    return {
        id,
        userId: "u1",
        status,
        transactionsSynced: 2,
        accountsSynced: 1,
        error: null,
        startedAt,
        finishedAt: status === "running" ? null : startedAt,
        createdAt: startedAt,
        scraperJobs: [],
    };
};

const runs = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => run(`${prefix}${i + 1}`));

const firstPage: ISyncJobPage = { items: runs("r", 10), nextCursor: "cursor-10" };
const secondPage: ISyncJobPage = { items: runs("older", 2), nextCursor: null };

const rowButtons = (wrapper: { findAll: (selector: string) => unknown[] }) => wrapper.findAll("tbody tr");

beforeEach(() => {
    vi.clearAllMocks();
    flags.desktop = true;
    api.getScraperConnections.mockResolvedValue([]);
    api.getActiveSyncJob.mockResolvedValue(null);
    api.listSyncJobs.mockImplementation(({ cursor }: { cursor?: string }) =>
        Promise.resolve(cursor === undefined ? firstPage : secondPage),
    );
    // The query client is shared across mounts in this file, so each test starts from an empty cache.
    useNuxtApp().$queryClient.clear();
    useSyncRunDialog().close();
});

describe("sync history page", () => {
    it("shows 10 runs, then appends the next page and hides the button at the end", async () => {
        const wrapper = await mountSuspended(SyncHistory);
        await vi.waitFor(() => expect(rowButtons(wrapper)).toHaveLength(10));

        expect(api.listSyncJobs).toHaveBeenNthCalledWith(1, { cursor: undefined, limit: 10 });
        const showOlder = wrapper.findAll("button").find((b) => b.text() === "Show older syncs");
        expect(showOlder).toBeDefined();

        await showOlder!.trigger("click");

        await vi.waitFor(() => expect(rowButtons(wrapper)).toHaveLength(12));
        expect(api.listSyncJobs).toHaveBeenNthCalledWith(2, { cursor: "cursor-10", limit: 50 });
        expect(wrapper.findAll("button").some((b) => b.text() === "Show older syncs")).toBe(false);
    });

    it("tags a running run Syncing and opens its dialog with all rows collapsed on row click", async () => {
        api.listSyncJobs.mockResolvedValueOnce({
            items: [run("live", "running"), run("done")],
            nextCursor: null,
        });
        const wrapper = await mountSuspended(SyncHistory);
        await vi.waitFor(() => expect(rowButtons(wrapper)).toHaveLength(2));

        expect(wrapper.find("tbody tr").text()).toContain("Syncing");

        await wrapper.findAll("tbody tr")[0]!.trigger("click");

        const dialog = useSyncRunDialog().state.value;
        expect(dialog.visible).toBe(true);
        expect(dialog.jobId).toBe("live");
        expect(dialog.expandConnectionId).toBeNull();
    });

    it("lists runs as buttons below md and opens the dialog from them", async () => {
        flags.desktop = false;
        api.listSyncJobs.mockResolvedValueOnce({ items: [run("m1")], nextCursor: null });
        const wrapper = await mountSuspended(SyncHistory);
        await vi.waitFor(() => expect(wrapper.find("li button").exists()).toBe(true));

        expect(wrapper.find("table").exists()).toBe(false);
        await wrapper.get("li button").trigger("click");

        expect(useSyncRunDialog().state.value.jobId).toBe("m1");
    });

    it("keeps the loaded runs and the retry button when an older page fails", async () => {
        // The app's default retry backoff runs for seconds; this test asserts the error state, not the retries.
        useNuxtApp().$queryClient.setQueryDefaults(bankSyncKeys.history(), { retry: false });
        const wrapper = await mountSuspended(SyncHistory);
        await vi.waitFor(() => expect(rowButtons(wrapper)).toHaveLength(10));

        api.listSyncJobs.mockRejectedValue(new Error("Network down"));
        const showOlder = () => wrapper.findAll("button").find((b) => b.text() === "Show older syncs");
        await showOlder()!.trigger("click");

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load older syncs."));
        expect(rowButtons(wrapper)).toHaveLength(10);
        expect(wrapper.text()).not.toContain("Couldn't load syncs.");
        expect(showOlder()).toBeDefined();
    });
});
