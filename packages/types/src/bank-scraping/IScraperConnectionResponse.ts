export interface IScraperConnectionResponse {
    id: string;
    companyId: string;
    displayName: string;
    scrapeLookbackDays: number;
    isActive: boolean;
    lastSyncedAt: Date | null;
    createdAt: Date;
}
