// Pure helpers for bank sync runs: the failure strip on a connection, and the run rows and details dialog.
import type { IScraperConnectionResponse, ISyncJob, ISyncJobPage, SyncJobStatus } from "@badger/types";
import { syncErrorCopy } from "./syncErrors";
import type { SyncErrorCopy } from "./syncErrors";

export type RunResultTone = "success" | "warn" | "danger" | "neutral";

const RUN_RESULTS: Record<SyncJobStatus, { label: string; tone: RunResultTone }> = {
    success: { label: "Success", tone: "success" },
    partial: { label: "Partial", tone: "warn" },
    failed: { label: "Failed", tone: "danger" },
    interrupted: { label: "Interrupted", tone: "neutral" },
    pending: { label: "Syncing", tone: "neutral" },
    running: { label: "Syncing", tone: "neutral" },
};

/** A connection whose latest finished run failed while it is still on. Paused connections never show a failure. */
export function isFailingConnection(connection: IScraperConnectionResponse): boolean {
    return connection.isActive && connection.latestJob?.status === "failed";
}

export function failingConnections(
    connections: ReadonlyArray<IScraperConnectionResponse> | undefined,
): IScraperConnectionResponse[] {
    return (connections ?? []).filter(isFailingConnection);
}

/** The header Sync button's accessible name and tooltip for `failingCount` failing connections. */
export function syncButtonLabel(failingCount: number): string {
    if (failingCount === 0) return "Sync";
    if (failingCount === 1) return "Sync, 1 connection failing";
    return `Sync, ${failingCount} connections failing`;
}

/** Copy for a connection's failure strip, plus the run its "details" opens; null when it shows no failure. */
export function failureStripFor(
    connection: IScraperConnectionResponse,
): (SyncErrorCopy & { syncJobId: string }) | null {
    if (!isFailingConnection(connection) || !connection.latestJob) return null;
    return { ...syncErrorCopy(connection.latestJob.errorCode), syncJobId: connection.latestJob.syncJobId };
}

/** Label and tone of a run's result tag. */
export function runResult(status: SyncJobStatus): { label: string; tone: RunResultTone } {
    return { ...RUN_RESULTS[status] };
}

/** The connection's name for a single-connection run, otherwise "All connections". */
export function runScope(run: ISyncJob): string {
    const [only] = run.scraperJobs;
    return run.scraperJobs.length === 1 && only ? only.displayName : "All connections";
}

/** Connections that synced in the run, out of the connections the run covered. */
export function runSyncedCount(run: ISyncJob): { synced: number; total: number } {
    return {
        synced: run.scraperJobs.filter((job) => job.status === "success").length,
        total: run.scraperJobs.length,
    };
}

/** One line on a run's row saying what went wrong; null for a run that succeeded or is still going. */
export function runProblemSummary(run: ISyncJob): string | null {
    if (run.status === "interrupted") return syncErrorCopy("INTERRUPTED").short;
    if (run.status !== "failed" && run.status !== "partial") return null;

    const failed = run.scraperJobs.filter((job) => job.status === "failed");
    if (failed.length === 0) return syncErrorCopy("UNKNOWN").short;

    const codes = new Set(failed.map((job) => job.errorCode ?? "UNKNOWN"));
    if (codes.size === 1) return syncErrorCopy(failed[0]?.errorCode).short;

    return `${failed.map((job) => job.displayName).join(", ")} failed`;
}

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

/** "45s", "2m 05s" or "1h 02m" between two run times; null while the run is unfinished. */
export function formatDuration(startedAt: Date | string, finishedAt: Date | string | null): string | null {
    if (finishedAt === null) return null;

    const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    if (!Number.isFinite(ms)) return null;

    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${pad(minutes)}m`;
    if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
    return `${seconds}s`;
}

/** Scraper-job ids a details dialog opens expanded: the failed row of `expandConnectionId`, if the run has one. */
export function initialExpanded(run: ISyncJob, expandConnectionId?: string | null): Set<string> {
    const expanded = new Set<string>();
    if (!expandConnectionId) return expanded;

    for (const job of run.scraperJobs) {
        if (job.status === "failed" && job.scraperConnectionId === expandConnectionId) expanded.add(job.id);
    }
    return expanded;
}

/** Rows on the first history page, then on each page from "Show older syncs". */
export const HISTORY_FIRST_PAGE = 10;
export const HISTORY_MORE_PAGE = 50;

/** Page params for the page after `page`; undefined once the API reports no further cursor. */
export function nextHistoryPageParam(page: ISyncJobPage): { cursor: string; limit: number } | undefined {
    if (page.nextCursor === null) return undefined;
    return { cursor: page.nextCursor, limit: HISTORY_MORE_PAGE };
}
