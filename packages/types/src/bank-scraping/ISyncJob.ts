import type { IScraperJob } from "./IScraperJob";

export type SyncJobStatus = "pending" | "running" | "success" | "partial" | "failed" | "interrupted";

export interface ISyncJob {
    id: string;
    userId: string;
    status: SyncJobStatus;
    transactionsSynced: number;
    accountsSynced: number;
    error: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    createdAt: Date;
    scraperJobs: IScraperJob[];
}

/** One page of a connection-independent run history, newest first. */
export interface ISyncJobPage {
    items: ISyncJob[];
    nextCursor: string | null;
}
