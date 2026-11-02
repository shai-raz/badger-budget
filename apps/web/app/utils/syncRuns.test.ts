import type { IScraperConnectionResponse, IScraperJob, ISyncJob, SyncJobStatus } from "@badger/types";
import { describe, expect, it } from "vitest";
import {
    failingConnections,
    failureStripFor,
    formatDuration,
    initialExpanded,
    isFailingConnection,
    runProblemSummary,
    runResult,
    runScope,
    runSyncedCount,
} from "./syncRuns";

const START = new Date("2026-06-10T08:00:00.000Z");

function connection(overrides: Partial<IScraperConnectionResponse> = {}): IScraperConnectionResponse {
    return {
        id: "conn-1",
        companyId: "bank-a",
        displayName: "Checking",
        scrapeLookbackDays: 30,
        isActive: true,
        lastSyncedAt: null,
        createdAt: START,
        latestJob: null,
        ...overrides,
    };
}

function scraperJob(overrides: Partial<IScraperJob> = {}): IScraperJob {
    return {
        id: "job-1",
        syncJobId: "run-1",
        scraperConnectionId: "conn-1",
        companyId: "bank-a",
        displayName: "Checking",
        status: "success",
        transactionsSynced: 0,
        accountsSynced: 0,
        error: null,
        errorCode: null,
        startedAt: START,
        finishedAt: START,
        createdAt: START,
        ...overrides,
    };
}

function run(status: SyncJobStatus, scraperJobs: IScraperJob[] = []): ISyncJob {
    return {
        id: "run-1",
        userId: "user-1",
        status,
        transactionsSynced: 0,
        accountsSynced: 0,
        error: null,
        startedAt: START,
        finishedAt: null,
        createdAt: START,
        scraperJobs,
    };
}

describe("isFailingConnection", () => {
    it("is true for an active connection whose latest job failed", () => {
        const failed = connection({
            latestJob: { syncJobId: "run-1", status: "failed", errorCode: "TIMEOUT", finishedAt: START },
        });
        expect(isFailingConnection(failed)).toBe(true);
    });

    it("is false for a paused connection, even when its latest job failed", () => {
        const paused = connection({
            isActive: false,
            latestJob: { syncJobId: "run-1", status: "failed", errorCode: "TIMEOUT", finishedAt: START },
        });
        expect(isFailingConnection(paused)).toBe(false);
    });

    it("is false when the latest job succeeded or there is none", () => {
        const ok = connection({
            latestJob: { syncJobId: "run-1", status: "success", errorCode: null, finishedAt: START },
        });
        expect(isFailingConnection(ok)).toBe(false);
        expect(isFailingConnection(connection())).toBe(false);
    });
});

describe("failingConnections", () => {
    it("keeps only the active connections whose latest job failed", () => {
        const failing = connection({
            id: "conn-fail",
            latestJob: { syncJobId: "run-1", status: "failed", errorCode: "TIMEOUT", finishedAt: START },
        });
        const list = [
            failing,
            connection({ id: "conn-ok" }),
            connection({
                id: "conn-paused",
                isActive: false,
                latestJob: { syncJobId: "run-2", status: "failed", errorCode: "TIMEOUT", finishedAt: START },
            }),
        ];

        expect(failingConnections(list)).toEqual([failing]);
    });

    it("is empty for undefined", () => {
        expect(failingConnections(undefined)).toEqual([]);
    });
});

describe("failureStripFor", () => {
    it("is null for a paused connection", () => {
        const paused = connection({
            isActive: false,
            latestJob: { syncJobId: "run-1", status: "failed", errorCode: "TIMEOUT", finishedAt: START },
        });
        expect(failureStripFor(paused)).toBeNull();
    });

    it("is null when the latest job succeeded", () => {
        const ok = connection({
            latestJob: { syncJobId: "run-1", status: "success", errorCode: null, finishedAt: START },
        });
        expect(failureStripFor(ok)).toBeNull();
    });

    it("gives the copy and the run for a failed connection", () => {
        const failed = connection({
            latestJob: { syncJobId: "run-9", status: "failed", errorCode: "ACCOUNT_BLOCKED", finishedAt: START },
        });
        expect(failureStripFor(failed)).toEqual({
            short: "The bank blocked online access",
            explain: expect.any(String),
            action: null,
            syncJobId: "run-9",
        });
    });

    it("reads a failed job with no error code as UNKNOWN", () => {
        const failed = connection({
            latestJob: { syncJobId: "run-9", status: "failed", errorCode: null, finishedAt: START },
        });
        expect(failureStripFor(failed)?.short).toBe("Something went wrong");
    });
});

describe("runResult", () => {
    it.each([
        ["success", "Success", "success"],
        ["partial", "Partial", "warn"],
        ["failed", "Failed", "danger"],
        ["interrupted", "Interrupted", "neutral"],
        ["pending", "Syncing", "neutral"],
        ["running", "Syncing", "neutral"],
    ] as const)("%s reads as %s (%s)", (status, label, tone) => {
        expect(runResult(status)).toEqual({ label, tone });
    });
});

describe("runScope", () => {
    it("names the connection for a single-connection run", () => {
        expect(runScope(run("success", [scraperJob({ displayName: "Savings" })]))).toBe("Savings");
    });

    it("reads All connections for a run with several or no connections", () => {
        expect(runScope(run("partial", [scraperJob(), scraperJob({ id: "job-2" })]))).toBe("All connections");
        expect(runScope(run("failed"))).toBe("All connections");
    });
});

describe("runSyncedCount", () => {
    it("counts the successful connections out of all the run's connections", () => {
        const jobs = [
            scraperJob({ status: "success" }),
            scraperJob({ id: "job-2", status: "failed" }),
            scraperJob({ id: "job-3", status: "success" }),
        ];
        expect(runSyncedCount(run("partial", jobs))).toEqual({ synced: 2, total: 3 });
    });

    it("is zero of zero for a run with no connections", () => {
        expect(runSyncedCount(run("failed"))).toEqual({ synced: 0, total: 0 });
    });
});

describe("runProblemSummary", () => {
    it.each(["success", "pending", "running"] as const)("is null for a %s run", (status) => {
        expect(runProblemSummary(run(status, [scraperJob({ status: "failed", errorCode: "TIMEOUT" })]))).toBeNull();
    });

    it("gives the interrupted message for an interrupted run", () => {
        expect(runProblemSummary(run("interrupted"))).toBe("The server restarted during the sync");
    });

    it("gives the job's short message for a single failed job", () => {
        const failed = run("failed", [scraperJob({ status: "failed", errorCode: "INVALID_PASSWORD" })]);
        expect(runProblemSummary(failed)).toBe("Wrong username or password");
    });

    it("gives one short message when several failed jobs share a code", () => {
        const failed = run("partial", [
            scraperJob({ id: "job-1", displayName: "Checking", status: "failed", errorCode: "TIMEOUT" }),
            scraperJob({ id: "job-2", displayName: "Savings", status: "failed", errorCode: "TIMEOUT" }),
            scraperJob({ id: "job-3", status: "success" }),
        ]);
        expect(runProblemSummary(failed)).toBe("The bank's site didn't respond");
    });

    it("names the failed connections when their codes differ", () => {
        const failed = run("partial", [
            scraperJob({ id: "job-1", displayName: "Checking", status: "failed", errorCode: "TIMEOUT" }),
            scraperJob({ id: "job-2", displayName: "Savings", status: "failed", errorCode: "ACCOUNT_BLOCKED" }),
            scraperJob({ id: "job-3", displayName: "Card", status: "success" }),
        ]);
        expect(runProblemSummary(failed)).toBe("Checking, Savings failed");
    });

    it("gives the UNKNOWN message for a failed run with no connections", () => {
        expect(runProblemSummary(run("failed"))).toBe("Something went wrong");
    });
});

describe("formatDuration", () => {
    it("formats seconds, minutes and hours", () => {
        expect(formatDuration("2026-06-10T08:00:00.000Z", "2026-06-10T08:00:45.000Z")).toBe("45s");
        expect(formatDuration("2026-06-10T08:00:00.000Z", "2026-06-10T08:02:05.000Z")).toBe("2m 05s");
        expect(formatDuration("2026-06-10T08:00:00.000Z", "2026-06-10T09:02:30.000Z")).toBe("1h 02m");
    });

    it("is null while the run is unfinished", () => {
        expect(formatDuration(START, null)).toBeNull();
    });

    it("reads a negative span as zero", () => {
        expect(formatDuration("2026-06-10T08:00:10.000Z", "2026-06-10T08:00:00.000Z")).toBe("0s");
    });
});

describe("initialExpanded", () => {
    const jobs = [
        scraperJob({ id: "job-failed", scraperConnectionId: "conn-1", status: "failed", errorCode: "TIMEOUT" }),
        scraperJob({ id: "job-other", scraperConnectionId: "conn-2", status: "failed", errorCode: "TIMEOUT" }),
        scraperJob({ id: "job-ok", scraperConnectionId: "conn-3", status: "success" }),
    ];

    it("expands only the failed job of the connection asked for", () => {
        expect(initialExpanded(run("partial", jobs), "conn-1")).toEqual(new Set(["job-failed"]));
    });

    it("expands nothing when the connection has no failed job in the run", () => {
        expect(initialExpanded(run("partial", jobs), "conn-3")).toEqual(new Set());
    });

    it("expands nothing when no connection is asked for", () => {
        expect(initialExpanded(run("partial", jobs))).toEqual(new Set());
        expect(initialExpanded(run("partial", jobs), null)).toEqual(new Set());
    });
});
