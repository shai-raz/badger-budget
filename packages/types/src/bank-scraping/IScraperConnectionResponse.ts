import type { SyncErrorCode } from "@badger/shared-data";

/** The most recent finished run of a connection, shown on the connection page. */
export interface IScraperConnectionLatestJob {
    syncJobId: string;
    status: "success" | "failed";
    errorCode: SyncErrorCode | null;
    finishedAt: Date;
}

export interface IScraperConnectionResponse {
    id: string;
    companyId: string;
    displayName: string;
    scrapeLookbackDays: number;
    isActive: boolean;
    lastSyncedAt: Date | null;
    createdAt: Date;
    latestJob: IScraperConnectionLatestJob | null;
}
