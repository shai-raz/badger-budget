import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createScraper } from "israeli-bank-scrapers";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getSourceTimezone } from "@badger/shared-data";
import { ImportCandidate } from "../transactions/transaction-import.service";
import { resolveDebugArtifactsDir } from "../config/data-dir";
import { DebugArtifactService } from "./debug-artifact.service";
import { toSourceCalendarDate, legacyStoredDate } from "./scraped-date.util";
import { extractAccountBalances, ScrapedAccountBalance } from "./scraped-balance.util";

// IBS ScraperErrorTypes values for credential errors (the enum isn't exported from the package root): never retried, since repeating bad credentials risks locking the account.
const NO_RETRY_ERROR_TYPES = new Set<string>(["INVALID_PASSWORD", "CHANGE_PASSWORD", "ACCOUNT_BLOCKED"]);

export interface ScrapeConnectionResult {
    candidates: ImportCandidate[];
    balances: ScrapedAccountBalance[];
}

@Injectable()
export class ScraperService {
    private readonly logger = new Logger(ScraperService.name);

    constructor(
        private configService: ConfigService,
        private debugArtifacts: DebugArtifactService,
    ) {}

    async scrapeConnection(
        companyId: string,
        credentials: Record<string, string>,
        lookbackDays: number,
    ): Promise<ScrapeConnectionResult> {
        const sourceTimeZone = getSourceTimezone(companyId);
        if (!sourceTimeZone) throw new Error(`No source date timezone declared for provider "${companyId}"`);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - lookbackDays);

        const browserlessUrl = this.configService.get<string>("BROWSERLESS_URL");

        // Stealth plugin patches headless fingerprints (navigator.webdriver, chrome object, etc.) on every new
        // page, on both paths: needed because some banks detect and block headless browsers. IBS would launch
        // plain puppeteer, so we launch the local Chromium ourselves and hand it over as `browser`.
        puppeteerExtra.use(StealthPlugin());
        const browser = browserlessUrl
            ? await puppeteerExtra.connect({ browserWSEndpoint: browserlessUrl })
            : await this.launchLocalBrowser();

        // Visa Cal's bot protection (Akamai) often rejects datacenter IPs, so Cal can be routed through an
        // Israeli proxy (CAL_PROXY_URL). It gets its own browser context (which IBS doesn't close for us),
        // and falls back to one direct attempt on the shared browser unless the credentials were rejected.
        const calProxyUrl = this.configService.get<string>("CAL_PROXY_URL");
        let result: any;

        try {
            if (companyId === "visaCal" && calProxyUrl) {
                let context: Awaited<ReturnType<typeof browser.createBrowserContext>> | undefined;
                try {
                    context = await browser.createBrowserContext({ proxyServer: calProxyUrl });
                    result = await this.runAttempt(
                        companyId,
                        credentials,
                        startDate,
                        lookbackDays,
                        { browserContext: context },
                        " (via CAL_PROXY_URL)",
                    );
                } catch (e) {
                    const errorType = (e as { errorType?: string } | null)?.errorType;
                    if (errorType && NO_RETRY_ERROR_TYPES.has(errorType)) throw e;
                    const reason = errorType ?? (e instanceof Error ? e.message : String(e));
                    this.logger.warn(`visaCal via CAL_PROXY_URL failed (${reason}), retrying directly`);
                } finally {
                    // After debug capture (done inside runAttempt), so the failure screenshot is taken first.
                    await context?.close().catch(() => undefined);
                }
            }

            if (!result) {
                // skipCloseBrowser: IBS must not close the browser; we close a local one ourselves below.
                const options: Record<string, unknown> = { browser, skipCloseBrowser: true };
                result = await this.runAttempt(companyId, credentials, startDate, lookbackDays, options, "");
            }
        } finally {
            // Only the local browser is ours to close; a Browserless instance is shared, so it stays open.
            if (!browserlessUrl) await browser.close().catch(() => undefined);
        }

        const candidates: ImportCandidate[] = [];
        let skippedNoIdentifier = 0;

        for (const account of result.accounts ?? []) {
            for (const txn of account.txns) {
                // Use the IBS identifier (Asmachta / bank reference number) as the externalId.
                // This matches exactly what Caspion writes to the Google Sheets column K, which
                // is what our sheet-sync path stores — ensuring cross-path dedup works correctly.
                //
                // Transactions without an identifier are skipped (mirrors Caspion's behaviour:
                // it leaves the id cell empty for these rows, and our sheet-sync drops them).
                // Common cases: pending credit-card charges (visa-cal sets identifier=undefined
                // for pending txns), and any provider row where the bank didn't return a reference
                // number (Beinleumi, Union, Yahav use `txn.reference ? parseInt(...) : undefined`).
                const rawId = txn.identifier;
                const isMissing =
                    rawId === undefined ||
                    rawId === null ||
                    rawId === "" ||
                    (typeof rawId === "number" && Number.isNaN(rawId));

                if (isMissing) {
                    skippedNoIdentifier++;
                    continue;
                }

                const externalId = String(rawId);

                // Determine currencies
                const chargedCurrencyCode = (txn as any).chargedCurrency ?? txn.originalCurrency;
                const hasOriginal = txn.originalCurrency !== chargedCurrencyCode;

                candidates.push({
                    externalId,
                    accountNumber: account.accountNumber,
                    // IBS stamps every date as midnight in IBS_DATE_TIMEZONE (global moment default, see
                    // SOURCE_TIMEZONE_BY_COMPANY). new Date(txn.date) straight into @db.Date would keep the previous UTC day.
                    transactionDate: toSourceCalendarDate(txn.date, sourceTimeZone),
                    postedDate: txn.processedDate ? toSourceCalendarDate(txn.processedDate, sourceTimeZone) : null,
                    legacyTransactionDate: legacyStoredDate(txn.date),
                    legacyPostedDate: txn.processedDate ? legacyStoredDate(txn.processedDate) : null,
                    amount: Math.abs(txn.chargedAmount),
                    signedAmount: txn.chargedAmount,
                    chargedCurrencyCode,
                    originalAmount: hasOriginal ? Math.abs(txn.originalAmount) : null,
                    originalCurrencyCode: hasOriginal ? txn.originalCurrency : null,
                    description: txn.description,
                    additionalDescription: txn.memo ?? null,
                    originalCategory: (txn as any).category ?? null,
                    paymentType: txn.type === "installments" ? "installments" : "normal",
                });
            }
        }

        if (skippedNoIdentifier > 0) {
            this.logger.warn(
                `Skipped ${skippedNoIdentifier} transaction(s) with no identifier (e.g. pending charges, missing reference number)`,
            );
        }

        // Balances come straight off the scraped accounts rather than being summed from `candidates`
        // — the skipped identifier-less rows above would otherwise under-count card totals.
        const balances = extractAccountBalances(result.accounts ?? [], companyId);

        this.logger.log(
            `Scrape complete: ${candidates.length} transactions and ${balances.length} balances from ${result.accounts?.length ?? 0} accounts`,
        );
        return { candidates, balances };
    }

    /** Launches headless local Chromium (PUPPETEER_EXECUTABLE_PATH, PUPPETEER_ARGS) through puppeteer-extra, as IBS does by default. */
    private launchLocalBrowser() {
        const executablePath = this.configService.get<string>("PUPPETEER_EXECUTABLE_PATH");
        const puppeteerArgs = this.configService.get<string>("PUPPETEER_ARGS", "");
        return puppeteerExtra.launch({
            executablePath: executablePath || undefined,
            args: puppeteerArgs ? puppeteerArgs.split(",") : [],
            headless: true,
        });
    }

    /** Runs one scrape with the given browser options. Captures debug artifacts and throws on failure. */
    private async runAttempt(
        companyId: string,
        credentials: Record<string, string>,
        startDate: Date,
        lookbackDays: number,
        browserOptions: Record<string, unknown>,
        logSuffix: string,
    ): Promise<any> {
        let debugPage: any = null;

        const scraperOptions: any = {
            companyId: companyId as any,
            startDate,
            combineInstallments: false,
            showBrowser: false,
            preparePage: async (page: any) => {
                debugPage = page;
                // Capture what the page looks like 5s in, while the selector wait is still running.
                // IBS closes the page on error so we can't screenshot after scrape() rejects.
                setTimeout(() => {
                    void this.captureDebugArtifacts(page, companyId, "5s");
                }, 5000);
            },
            ...browserOptions,
        };

        const scraper = createScraper(scraperOptions);

        this.logger.log(`Starting scrape for ${companyId}, lookback ${lookbackDays} days${logSuffix}`);

        let result: any;
        try {
            result = await scraper.scrape(credentials as any);
        } catch (e) {
            await this.captureDebugArtifacts(debugPage, companyId);
            throw e;
        }

        if (!result.success) {
            await this.captureDebugArtifacts(debugPage, companyId);
            throw Object.assign(new Error(`Scraper failed: ${result.errorType} — ${result.errorMessage}`), {
                errorType: result.errorType as string,
            });
        }
        return result;
    }

    private async captureDebugArtifacts(page: any, companyId: string, label = "failure"): Promise<void> {
        if (!page) {
            this.logger.warn(`[DEBUG ${label}] ${companyId} — page was never created (preparePage not called)`);
            return;
        }

        const now = new Date();
        const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const timestamp = now.toISOString().replace(/:/g, "-"); // ISO with colons replaced for path safety
        const prefix = `scraper-debug/${companyId}/${date}/${timestamp}/`;

        const [urlResult, ssResult, mhtmlResult, htmlResult] = await Promise.allSettled([
            page.url() as Promise<string>,
            page.screenshot() as Promise<Buffer>,
            this.captureMhtml(page),
            page.content() as Promise<string>,
        ]);

        const pageUrl = urlResult.status === "fulfilled" ? urlResult.value : "<unavailable>";
        const ssBuf = ssResult.status === "fulfilled" ? ssResult.value : null;
        const mhtmlBuf = mhtmlResult.status === "fulfilled" ? mhtmlResult.value : null;
        const html = htmlResult.status === "fulfilled" ? (htmlResult.value as string) : null;

        const [screenshotRef, snapshotRef] = await Promise.all([
            ssBuf
                ? this.storeArtifact(
                      `${prefix}screenshot.png`,
                      ssBuf,
                      "image/png",
                      companyId,
                      date,
                      timestamp,
                      "screenshot.png",
                  )
                : Promise.resolve("<capture failed>"),
            mhtmlBuf
                ? this.storeArtifact(
                      `${prefix}snapshot.mhtml`,
                      mhtmlBuf,
                      "multipart/related",
                      companyId,
                      date,
                      timestamp,
                      "snapshot.mhtml",
                  )
                : Promise.resolve("<capture failed>"),
        ]);

        // Also persist html alongside the other artifacts when available
        if (html) {
            const htmlBuf = Buffer.from(html, "utf-8");
            await this.storeArtifact(
                `${prefix}page.html`,
                htmlBuf,
                "text/html",
                companyId,
                date,
                timestamp,
                "page.html",
            ).catch(() => undefined);
        }

        this.logger.error(
            `[DEBUG ${label}] ${companyId} url=${pageUrl} screenshot=${screenshotRef} snapshot=${snapshotRef}`,
        );
    }

    private async captureMhtml(page: any): Promise<Buffer> {
        const cdp = await page.target().createCDPSession();
        const { data } = await cdp.send("Page.captureSnapshot", { format: "mhtml" });
        return Buffer.from(data as string, "utf-8");
    }

    private async storeArtifact(
        r2Key: string,
        buf: Buffer,
        contentType: string,
        companyId: string,
        date: string,
        timestamp: string,
        filename: string,
    ): Promise<string> {
        const refs: string[] = [];

        const r2Url = await this.debugArtifacts.upload(r2Key, buf, contentType);
        if (r2Url) refs.push(r2Url);

        if (this.configService.get<string>("STORE_SCRAPER_DEBUG_LOCALLY") === "true") {
            const dir = join(resolveDebugArtifactsDir(), companyId, date, timestamp);
            await mkdir(dir, { recursive: true });
            const filePath = join(dir, filename);
            await writeFile(filePath, buf);
            refs.push(filePath);
        }

        if (refs.length === 0) return "<skipped>";
        if (refs.length === 1) return refs[0];
        return `${refs[0]} (local: ${refs[1]})`;
    }

    /**
     * @deprecated Not currently used — kept for reference.
     *
     * Originally this was used to replicate Caspion's transaction hash as the `externalId`,
     * under the assumption that Caspion stores its hash as the sheet id. In reality, Caspion
     * writes `transaction.identifier` (Asmachta) to the id column (column K) and the hash to
     * a separate column (G) that our sheet-sync explicitly ignores. Using this hash as
     * `externalId` therefore never matched anything in the DB and caused duplicates.
     *
     * The dedup now uses `txn.identifier` directly (see `scrapeConnection` above).
     */
    private calculateTransactionHash(
        txn: { date: string; chargedAmount: number; description: string; memo?: string },
        companyId: string,
        accountNumber: string,
    ): string {
        const raw = `${txn.date}_${txn.chargedAmount}_${txn.description}_${txn.memo ?? ""}_${companyId}_${accountNumber}`;
        return this.unifyHash(raw);
    }

    /**
     * @deprecated Not currently used — see {@link calculateTransactionHash}.
     */
    private unifyHash(hash: string): string {
        return (
            hash
                .replace(/`/g, "'")
                .replace(/00\dZ/, "000Z")
                // eslint-disable-next-line no-control-regex
                .replace(/[ ­‎]/g, "")
                .replace("‏", "")
        ); // RTL mark
    }
}
