import type { SyncErrorCode } from "@badger/shared-data";

export type ScraperJobStatus = "pending" | "running" | "success" | "failed";

export interface IScraperJob {
    id: string;
    syncJobId: string;
    scraperConnectionId: string | null;
    companyId: string;
    displayName: string;
    status: ScraperJobStatus;
    transactionsSynced: number;
    accountsSynced: number;
    error: string | null;
    /** Classified failure; null when the job succeeded or has not finished. */
    errorCode: SyncErrorCode | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
}
