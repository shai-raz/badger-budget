import type { BankCompanyId } from "./providers";

/**
 * The zone in which israeli-bank-scrapers (IBS) stamps every scraped date. BaseScraper.initialize()
 * (node_modules/israeli-bank-scrapers/lib/scrapers/base-scraper.js:23) calls
 * moment.tz.setDefault('Asia/Jerusalem') globally on every scrape, so a bank's calendar day D comes back as
 * D 00:00 Asia/Jerusalem serialised to UTC (e.g. "2026-09-30T21:00:00.000Z" for 2026-10-01), whatever the
 * server TZ. Guarded by apps/api/src/bank-sync/ibs-date-timezone.spec.ts, which fails if IBS changes this.
 */
export const IBS_DATE_TIMEZONE = "Asia/Jerusalem";

/**
 * The IANA zone in which each provider's *scraping library* stamps its dates. The IBS adapter reads scraped
 * instants back in this zone to recover the bank's calendar day. This is a property of the library, not of the
 * bank or the user: never put a user's timezone here.
 *
 * Every provider today is served by IBS, so every entry references IBS_DATE_TIMEZONE (never a bare string).
 * A provider from another library must NOT copy IBS_DATE_TIMEZONE: work out where that library stamps its
 * dates, declare its own constant with a comment citing the source, add a canary test like
 * ibs-date-timezone.spec.ts, and update the "every provider is IBS" test there. Total over BankCompanyId, so a
 * new provider fails to compile until this choice is made.
 */
export const SOURCE_TIMEZONE_BY_COMPANY: Record<BankCompanyId, string> = {
    hapoalim: IBS_DATE_TIMEZONE,
    leumi: IBS_DATE_TIMEZONE,
    discount: IBS_DATE_TIMEZONE,
    mercantile: IBS_DATE_TIMEZONE,
    mizrahi: IBS_DATE_TIMEZONE,
    otsar: IBS_DATE_TIMEZONE,
    visaCal: IBS_DATE_TIMEZONE,
    max: IBS_DATE_TIMEZONE,
    isracard: IBS_DATE_TIMEZONE,
    amex: IBS_DATE_TIMEZONE,
    union: IBS_DATE_TIMEZONE,
    beinleumi: IBS_DATE_TIMEZONE,
    massad: IBS_DATE_TIMEZONE,
    yahav: IBS_DATE_TIMEZONE,
    beyhadBishvilha: IBS_DATE_TIMEZONE,
};

/** null for an unknown companyId (it is usually a bare string read from the DB). Callers must not guess a zone. */
export function getSourceTimezone(companyId: string): string | null {
    return SOURCE_TIMEZONE_BY_COMPANY[companyId as BankCompanyId] ?? null;
}
