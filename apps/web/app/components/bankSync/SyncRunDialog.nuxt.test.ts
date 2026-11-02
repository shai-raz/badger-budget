import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { useNuxtApp } from "#app";
import type { VueWrapper } from "@vue/test-utils";
import type { IScraperConnectionResponse, IScraperJob, ISyncJob } from "@badger/types";
import SyncRunDialog from "./SyncRunDialog.vue";
import { useSyncRunDialog } from "../../composables/bankSync/useSyncRunDialog";
import { syncErrorCopy } from "../../utils/syncErrors";

const api = vi.hoisted(() => ({
    getSyncJob: vi.fn(),
    getScraperConnections: vi.fn(),
}));
const toastAdd = vi.hoisted(() => vi.fn());
const flow = vi.hoisted(() => ({ requestSync: vi.fn() }));

// The real queries run against this fake API; the sync flow and toast are stubbed.
vi.mock("../../composables/useApiClient", () => ({ useApiClient: () => api }));
vi.mock("../../composables/bankSync/useBankSyncFlow", () => ({ useBankSyncFlow: () => flow }));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));

const RAW_ERROR = "Login failed: invalid credentials for user ***";

const connection = (id: string, displayName: string, companyId: string): IScraperConnectionResponse => ({
    id,
    companyId,
    displayName,
    scrapeLookbackDays: 30,
    isActive: true,
    lastSyncedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    latestJob: null,
});

const connections = [
    connection("conn-a", "Visa Cal", "visaCal"),
    connection("conn-b", "Hapoalim", "hapoalim"),
    connection("conn-c", "Leumi", "leumi"),
];

const scraperJob = (overrides: Partial<IScraperJob>): IScraperJob => ({
    id: "job-a",
    syncJobId: "run-1",
    scraperConnectionId: "conn-a",
    companyId: "visaCal",
    displayName: "Visa Cal",
    status: "success",
    transactionsSynced: 12,
    accountsSynced: 1,
    error: null,
    errorCode: null,
    startedAt: new Date("2026-03-01T10:00:00Z"),
    finishedAt: new Date("2026-03-01T10:00:30Z"),
    createdAt: new Date("2026-03-01T10:00:00Z"),
    ...overrides,
});

const run: ISyncJob = {
    id: "run-1",
    userId: "user-1",
    status: "partial",
    transactionsSynced: 12,
    accountsSynced: 1,
    error: null,
    startedAt: new Date("2026-03-01T10:00:00Z"),
    finishedAt: new Date("2026-03-01T10:01:05Z"),
    createdAt: new Date("2026-03-01T10:00:00Z"),
    scraperJobs: [
        scraperJob({ id: "job-a", scraperConnectionId: "conn-a", displayName: "Visa Cal", status: "success" }),
        scraperJob({
            id: "job-b",
            scraperConnectionId: "conn-b",
            companyId: "hapoalim",
            displayName: "Hapoalim",
            status: "failed",
            transactionsSynced: 0,
            error: RAW_ERROR,
            errorCode: "INVALID_PASSWORD",
        }),
        scraperJob({
            id: "job-c",
            scraperConnectionId: "conn-c",
            companyId: "leumi",
            displayName: "Leumi",
            status: "failed",
            transactionsSynced: 0,
            error: "Timeout after 90000ms",
            errorCode: "TIMEOUT",
        }),
    ],
};

const mounted: VueWrapper[] = [];

// The dialog teleports to <body>, so its rows are queried there rather than through the wrapper.
const failedRowButtons = () => Array.from(document.body.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"));
const failedRowButton = (name: string) => failedRowButtons().find((b) => b.textContent?.includes(name)) ?? null;
const technicalDetailsToggle = () =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent?.trim() === "Technical details",
    ) ?? null;

async function openDialog(options: { expandConnectionId?: string } = {}) {
    const wrapper = await mountSuspended(SyncRunDialog);
    mounted.push(wrapper);
    useSyncRunDialog().open("run-1", options);
    await vi.waitFor(() => expect(failedRowButton("Hapoalim")).not.toBeNull());
    return wrapper;
}

beforeEach(() => {
    vi.clearAllMocks();
    // The query client is shared across mounts in this file, so each test starts from an empty cache and a closed dialog.
    useNuxtApp().$queryClient.clear();
    useSyncRunDialog().state.value = { visible: false, jobId: null, expandConnectionId: null };
    api.getSyncJob.mockResolvedValue(run);
    api.getScraperConnections.mockResolvedValue(connections);
});

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("SyncRunDialog failed rows", () => {
    it("renders failed rows collapsed by default", async () => {
        await openDialog();

        expect(failedRowButton("Hapoalim")?.getAttribute("aria-expanded")).toBe("false");
        expect(failedRowButton("Leumi")?.getAttribute("aria-expanded")).toBe("false");
        expect(document.body.textContent).not.toContain(syncErrorCopy("INVALID_PASSWORD").explain);
    });

    it("renders the row of expandConnectionId expanded", async () => {
        await openDialog({ expandConnectionId: "conn-b" });

        expect(failedRowButton("Hapoalim")?.getAttribute("aria-expanded")).toBe("true");
        expect(document.body.textContent).toContain(syncErrorCopy("INVALID_PASSWORD").explain);
        expect(failedRowButton("Leumi")?.getAttribute("aria-expanded")).toBe("false");
    });

    it("expands a collapsed failed row when its header is clicked", async () => {
        await openDialog();

        failedRowButton("Leumi")?.click();

        await vi.waitFor(() => expect(failedRowButton("Leumi")?.getAttribute("aria-expanded")).toBe("true"));
        expect(document.body.textContent).toContain(syncErrorCopy("TIMEOUT").explain);
        expect(failedRowButton("Hapoalim")?.getAttribute("aria-expanded")).toBe("false");
    });

    it("gives success rows no expand button", async () => {
        await openDialog();

        const successButtons = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).filter((b) =>
            b.textContent?.includes("Visa Cal"),
        );
        expect(successButtons).toHaveLength(0);
        expect(failedRowButtons()).toHaveLength(2);
    });

    it("reveals the raw error under Technical details", async () => {
        await openDialog({ expandConnectionId: "conn-b" });

        expect(document.body.querySelector("pre")).toBeNull();
        await vi.waitFor(() => expect(technicalDetailsToggle()).not.toBeNull());
        technicalDetailsToggle()?.click();

        await vi.waitFor(() => expect(document.body.querySelector("pre")?.textContent).toContain(RAW_ERROR));
    });
});
