import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref, type EffectScope } from "vue";
import { provideBankSyncFlow } from "./useBankSyncFlow";
import { SyncUnlockError } from "../../utils/syncPasskeyWebAuthn";
import type { IScraperJob, ISyncJob } from "@badger/types";

const mocks = await vi.hoisted(async () => {
    const { ref } = await import("vue");
    return {
        full: vi.fn(),
        single: vi.fn(),
        unlock: vi.fn(),
        available: vi.fn(),
        addToast: vi.fn(),
        invalidate: vi.fn(),
        // The job the mocked sync-job query returns. Tests set it to drive the flow's job watch.
        jobData: ref<ISyncJob | null>(null),
    };
});
vi.mock("vue", async (original) => ({
    ...(await original<typeof import("vue")>()),
    provide: vi.fn(),
    onMounted: vi.fn(),
    onBeforeUnmount: vi.fn(),
    useId: () => "test",
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: mocks.addToast, removeGroup: vi.fn() }) }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("../../stores/auth", () => ({ useAuthStore: () => ({ user: { id: "user-1" } }) }));
vi.mock("./useSyncUnlock", () => ({
    useSyncUnlock: () => ({
        isWebAuthnAvailable: mocks.available,
        unlock: mocks.unlock,
        isPlatformAuthenticatorAvailable: async () => false,
        fetchPasskeys: async () => [],
        register: vi.fn(),
    }),
}));
vi.mock("./useBankSync", () => ({
    bankSyncKeys: {
        passkeys: () => ["bank-sync", "passkeys"],
        history: () => ["bank-sync", "history"],
        connections: () => ["bank-sync", "connections"],
    },
    useTriggerSyncMutation: () => ({ isPending: ref(false), mutateAsync: mocks.full }),
    useTriggerConnectionSyncMutation: () => ({ isPending: ref(false), mutateAsync: mocks.single }),
    useActiveSyncJobQuery: () => ({ data: ref(null), refetch: vi.fn() }),
    useSyncJobQuery: () => ({ data: mocks.jobData }),
    useSyncPasskeysQuery: () => ({ data: ref([{ credentialId: "passkey-1" }]) }),
}));

const scraperJob = (overrides: Partial<IScraperJob>): IScraperJob => ({
    id: "scraper-1",
    syncJobId: "single-job",
    scraperConnectionId: "bank-1",
    companyId: "visaCal",
    displayName: "Visa Cal",
    status: "failed",
    transactionsSynced: 0,
    accountsSynced: 0,
    error: "RAW BANK TEXT",
    errorCode: "INVALID_PASSWORD",
    startedAt: new Date("2026-03-01T10:00:00Z"),
    finishedAt: new Date("2026-03-01T10:00:30Z"),
    createdAt: new Date("2026-03-01T10:00:00Z"),
    ...overrides,
});
const syncJob = (overrides: Partial<ISyncJob>): ISyncJob => ({
    id: "single-job",
    userId: "user-1",
    status: "success",
    transactionsSynced: 0,
    accountsSynced: 0,
    error: null,
    startedAt: new Date("2026-03-01T10:00:00Z"),
    finishedAt: new Date("2026-03-01T10:01:00Z"),
    createdAt: new Date("2026-03-01T10:00:00Z"),
    scraperJobs: [],
    ...overrides,
});
let scope: EffectScope;
let flow: ReturnType<typeof provideBankSyncFlow>;
beforeEach(() => {
    vi.resetAllMocks();
    mocks.jobData.value = null;
    mocks.full.mockResolvedValue({ jobId: "full-job" });
    mocks.single.mockResolvedValue({ jobId: "single-job" });
    mocks.unlock.mockResolvedValue("1234");
    mocks.available.mockReturnValue(false);
    scope = effectScope();
    flow = scope.run(() => provideBankSyncFlow())!;
});
afterEach(() => scope.stop());
const settle = async () => {
    for (let i = 0; i < 10; i++) await nextTick();
};

describe("shared bank sync flow", () => {
    it("syncs the selected connection using a typed PIN", async () => {
        flow.requestSync({ connectionId: "bank-1" });
        flow.pin.value = "1234";
        await flow.submitSync();
        expect(mocks.single).toHaveBeenCalledWith({
            connectionId: "bank-1",
            pin: "1234",
            defaultCurrencyCode: undefined,
        });
        expect(mocks.full).not.toHaveBeenCalled();
        expect(flow.activeJobId.value).toBe("single-job");
        expect(flow.pin.value).toBe("");
    });

    it("clears a cancelled selection before a header full sync", async () => {
        flow.requestSync({ connectionId: "bank-1" });
        flow.pin.value = "1234";
        flow.cancelSync();
        expect(flow.pin.value).toBe("");
        flow.requestSync({ defaultCurrencyCode: "ILS" });
        flow.pin.value = "5678";
        await flow.submitSync();
        expect(mocks.full).toHaveBeenCalledWith({ pin: "5678", defaultCurrencyCode: "ILS" });
        expect(mocks.single).not.toHaveBeenCalled();
    });

    it("retains the connection through passkey fallback and PIN submission", async () => {
        mocks.available.mockReturnValue(true);
        mocks.unlock.mockRejectedValue(new SyncUnlockError("cancelled"));
        flow.requestSync({ connectionId: "bank-2" });
        await settle();
        expect(flow.pinDialogVisible.value).toBe(true);
        flow.pin.value = "1234";
        await flow.submitSync();
        expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "bank-2", pin: "1234" }));
    });

    it("retains the target when trying the passkey again from the PIN dialog", async () => {
        flow.requestSync({ connectionId: "bank-2" });
        await nextTick();
        await flow.tryPasskeySync();
        expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "bank-2", pin: "1234" }));
    });

    it("uses the passkey directly from the connection menu", async () => {
        mocks.available.mockReturnValue(true);
        flow.requestSync({ connectionId: "bank-3" });
        await settle();
        expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "bank-3" }));
        expect(flow.pinDialogVisible.value).toBe(false);
    });

    it("keeps the target for a retry after a rejected submission", async () => {
        mocks.single.mockRejectedValueOnce(new Error("Network error"));
        flow.requestSync({ connectionId: "bank-1" });
        flow.pin.value = "1234";
        await flow.submitSync();
        expect(flow.pinDialogVisible.value).toBe(true);
        await flow.submitSync();
        expect(mocks.single).toHaveBeenLastCalledWith(expect.objectContaining({ connectionId: "bank-1" }));
    });

    it("blocks a second entry point during unlock and while a job runs", async () => {
        let resolvePin!: (pin: string) => void;
        mocks.available.mockReturnValue(true);
        mocks.unlock.mockImplementation(
            () =>
                new Promise<string>((resolve) => {
                    resolvePin = resolve;
                }),
        );
        flow.requestSync({ connectionId: "bank-1" });
        flow.requestSync();
        resolvePin("1234");
        await settle();
        flow.requestSync();
        expect(mocks.unlock).toHaveBeenCalledTimes(1);
        expect(mocks.single).toHaveBeenCalledTimes(1);
        expect(mocks.full).not.toHaveBeenCalled();
    });
});

describe("syncConnectionWithPin", () => {
    it("syncs the connection with the given PIN and tracks the job", async () => {
        const started = await flow.syncConnectionWithPin("bank-4", "1234", { typed: true });
        expect(started).toBe(true);
        expect(mocks.single).toHaveBeenCalledWith({
            connectionId: "bank-4",
            pin: "1234",
            defaultCurrencyCode: undefined,
        });
        expect(mocks.full).not.toHaveBeenCalled();
        expect(flow.activeJobId.value).toBe("single-job");
    });

    it("refreshes the history list so the new run shows as Syncing", async () => {
        await flow.syncConnectionWithPin("bank-4", "1234", { typed: true });
        expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["bank-sync", "history"] });
    });

    it("refuses while a sync is running, with an info toast and no mutation", async () => {
        await flow.syncConnectionWithPin("bank-4", "1234", { typed: false });
        const started = await flow.syncConnectionWithPin("bank-5", "5678", { typed: false });
        expect(started).toBe(false);
        expect(mocks.single).toHaveBeenCalledTimes(1);
        expect(mocks.addToast).toHaveBeenCalledWith(
            expect.objectContaining({ severity: "info", summary: "A sync is already running" }),
        );
    });

    it("shows the start error and returns false when the mutation rejects", async () => {
        mocks.single.mockRejectedValueOnce(new Error("Network error"));
        const started = await flow.syncConnectionWithPin("bank-4", "1234", { typed: true });
        expect(started).toBe(false);
        expect(flow.activeJobId.value).toBeNull();
        expect(mocks.addToast).toHaveBeenCalledWith(
            expect.objectContaining({ severity: "error", summary: "Failed to Start Sync" }),
        );
    });
});

describe("sync result toasts", () => {
    // Starts a single-connection sync, then reports its job as finished.
    const finishRun = async (job: ISyncJob) => {
        await flow.syncConnectionWithPin("bank-1", "1234", { typed: true });
        mocks.jobData.value = job;
        await settle();
    };

    it("links a partial sync toast to its run, without raw bank error text", async () => {
        await finishRun(
            syncJob({
                status: "partial",
                transactionsSynced: 3,
                scraperJobs: [
                    scraperJob({ id: "scraper-1", displayName: "Visa Cal", status: "success", errorCode: null }),
                    scraperJob({ id: "scraper-2", displayName: "Leumi", errorCode: "TIMEOUT" }),
                ],
            }),
        );
        expect(mocks.addToast).toHaveBeenCalledWith(
            expect.objectContaining({
                group: "sync-result",
                severity: "warn",
                summary: "Sync partly complete",
                detail: "Synced 3 transactions. The bank's site didn't respond.",
                data: { jobId: "single-job", seeWhy: true },
            }),
        );
        expect(JSON.stringify(mocks.addToast.mock.calls)).not.toContain("RAW BANK TEXT");
        expect(flow.activeJobId.value).toBeNull();
    });

    it("links a failed sync toast to its run", async () => {
        await finishRun(syncJob({ status: "failed", scraperJobs: [scraperJob({})] }));
        expect(mocks.addToast).toHaveBeenCalledWith(
            expect.objectContaining({
                group: "sync-result",
                severity: "error",
                summary: "Sync failed",
                detail: "Wrong username or password.",
                data: { jobId: "single-job", seeWhy: true },
            }),
        );
        expect(flow.activeJobId.value).toBeNull();
    });

    it("ends an interrupted run cleanly, with no See why link", async () => {
        await finishRun(syncJob({ status: "interrupted" }));
        expect(mocks.addToast).toHaveBeenCalledWith(
            expect.objectContaining({
                group: "sync-result",
                severity: "warn",
                summary: "Sync interrupted",
                detail: "The server restarted during the sync.",
                data: { jobId: "single-job", seeWhy: false },
            }),
        );
        expect(flow.activeJobId.value).toBeNull();
        expect(flow.syncedCount.value).toBeNull();
    });

    it.each(["success", "partial", "failed", "interrupted"] as const)(
        "refreshes the history list when the run ends as %s",
        async (status) => {
            await flow.syncConnectionWithPin("bank-1", "1234", { typed: true });
            mocks.invalidate.mockClear();
            mocks.jobData.value = syncJob({ status });
            await settle();
            expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["bank-sync", "history"] });
        },
    );

    it("leaves the history list alone while the run is still going", async () => {
        await flow.syncConnectionWithPin("bank-1", "1234", { typed: true });
        mocks.invalidate.mockClear();
        mocks.jobData.value = syncJob({ status: "running" });
        await settle();
        expect(mocks.invalidate).not.toHaveBeenCalledWith({ queryKey: ["bank-sync", "history"] });
    });

    it("keeps the success toast outside the sync-result group", async () => {
        await finishRun(syncJob({ status: "success", transactionsSynced: 1 }));
        expect(mocks.addToast).toHaveBeenCalledWith(
            expect.objectContaining({ severity: "success", summary: "Sync complete" }),
        );
        expect(mocks.addToast.mock.calls[0]?.[0]).not.toHaveProperty("group");
    });
});

describe("per-connection sync state", () => {
    const startSingleSync = async () => {
        flow.requestSync({ connectionId: "bank-1" });
        flow.pin.value = "1234";
        await flow.submitSync();
        expect(flow.activeJobId.value).toBe("single-job");
    };
    const runningJob = (scraperJobs: IScraperJob[]) => syncJob({ id: "single-job", status: "running", scraperJobs });

    it("reports running and pending connections of the active run", async () => {
        await startSingleSync();
        mocks.jobData.value = runningJob([
            scraperJob({ id: "scraper-a", scraperConnectionId: "conn-a", status: "running", finishedAt: null }),
            scraperJob({ id: "scraper-b", scraperConnectionId: "conn-b", status: "pending", finishedAt: null }),
        ]);
        await settle();
        expect(flow.connectionSyncState("conn-a")).toBe("running");
        expect(flow.connectionSyncState("conn-b")).toBe("pending");
        expect(flow.connectionSyncState("unknown")).toBeNull();
    });

    it("reports nothing for a run with a different id", async () => {
        await startSingleSync();
        mocks.jobData.value = syncJob({
            id: "other-job",
            status: "running",
            scraperJobs: [scraperJob({ scraperConnectionId: "conn-a", status: "running", finishedAt: null })],
        });
        await settle();
        expect(flow.connectionSyncState("conn-a")).toBeNull();
    });

    it("reports nothing once the run has succeeded", async () => {
        await startSingleSync();
        mocks.jobData.value = runningJob([
            scraperJob({ scraperConnectionId: "conn-a", status: "running", finishedAt: null }),
        ]);
        await settle();
        mocks.jobData.value = syncJob({
            id: "single-job",
            status: "success",
            scraperJobs: [scraperJob({ scraperConnectionId: "conn-a", status: "success" })],
        });
        await settle();
        expect(flow.connectionSyncState("conn-a")).toBeNull();
    });

    it("refreshes the connections once per newly finished bank during the run", async () => {
        const connectionsKey = JSON.stringify(["bank-sync", "connections"]);
        const connectionsCalls = () =>
            mocks.invalidate.mock.calls.filter(([arg]) => JSON.stringify(arg?.queryKey) === connectionsKey).length;
        await startSingleSync();
        mocks.invalidate.mockClear();

        // First poll: nothing has finished yet, so nothing new to show.
        mocks.jobData.value = runningJob([
            scraperJob({ id: "scraper-a", scraperConnectionId: "conn-a", status: "running", finishedAt: null }),
            scraperJob({ id: "scraper-b", scraperConnectionId: "conn-b", status: "pending", finishedAt: null }),
        ]);
        await settle();
        expect(connectionsCalls()).toBe(0);

        // Bank a finished: its row must refresh now, not at the end of the run.
        mocks.jobData.value = runningJob([
            scraperJob({ id: "scraper-a", scraperConnectionId: "conn-a", status: "success" }),
            scraperJob({ id: "scraper-b", scraperConnectionId: "conn-b", status: "running", finishedAt: null }),
        ]);
        await settle();
        expect(connectionsCalls()).toBe(1);

        // The same finished set again is not new, so no further refresh.
        mocks.jobData.value = runningJob([
            scraperJob({ id: "scraper-a", scraperConnectionId: "conn-a", status: "success" }),
            scraperJob({ id: "scraper-b", scraperConnectionId: "conn-b", status: "running", finishedAt: null }),
        ]);
        await settle();
        expect(connectionsCalls()).toBe(1);
    });
});
