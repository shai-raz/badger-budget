import { createRequire } from "module";

export interface IbsMoment {
    (input: string, format: string): { toISOString(): string };
    defaultZone: { name: string } | null;
    tz: { setDefault(zone?: string): void };
}
export interface BaseScraperLike {
    initialize(): Promise<void>;
}

/**
 * Loads IBS internals through Node's own require, so tests get the same moment instance IBS mutates
 * (BaseScraper.initialize() calls moment.tz.setDefault). Test-only.
 */
export function loadIbsInternals(): {
    moment: IbsMoment;
    BaseScraper: new (options: { companyId: string }) => BaseScraperLike;
} {
    const ibsRequire = createRequire(require.resolve("israeli-bank-scrapers"));
    const moment = ibsRequire("moment") as IbsMoment;
    const { BaseScraper } = ibsRequire("./scrapers/base-scraper") as {
        BaseScraper: new (options: { companyId: string }) => BaseScraperLike;
    };
    return { moment, BaseScraper };
}
