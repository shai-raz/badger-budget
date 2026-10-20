export interface ICreateScraperConnection {
    pin: string;
    companyId: string;
    displayName: string;
    credentials: Record<string, string>;
    scrapeLookbackDays: number;
}
