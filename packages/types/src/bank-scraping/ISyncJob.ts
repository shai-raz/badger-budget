import type { IScraperJob } from "./IScraperJob";

export interface ISyncJob {
    id: string;
    userId: string;
    status: "pending" | "running" | "success" | "partial" | "failed";
    transactionsSynced: number;
    accountsSynced: number;
    error: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    createdAt: Date;
    scraperJobs: IScraperJob[];
}
