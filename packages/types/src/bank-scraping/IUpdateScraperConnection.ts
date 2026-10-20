export interface IUpdateScraperConnection {
    displayName?: string;
    scrapeLookbackDays?: number;
    isActive?: boolean;
    pin?: string;
    credentials?: Record<string, string>;
}
