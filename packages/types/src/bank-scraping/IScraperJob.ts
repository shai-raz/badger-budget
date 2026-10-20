export interface IScraperJob {
    id: string;
    syncJobId: string;
    scraperConnectionId: string | null;
    companyId: string;
    displayName: string;
    status: "pending" | "running" | "success" | "failed";
    transactionsSynced: number;
    accountsSynced: number;
    error: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
}
