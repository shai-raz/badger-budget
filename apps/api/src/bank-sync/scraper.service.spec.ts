import { Logger } from "@nestjs/common";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { ConfigService } from "@nestjs/config";
import { tmpdir } from "os";
import { join } from "path";
import { ScraperService } from "./scraper.service";
import { resolveDebugArtifactsDir } from "../config/data-dir";

jest.mock("../config/data-dir", () => ({ resolveDebugArtifactsDir: jest.fn(() => "") }));

const mockCreateScraper = jest.fn();
const mockConnect = jest.fn();
const mockLaunch = jest.fn();

jest.mock("israeli-bank-scrapers", () => ({
    createScraper: (...args: unknown[]) => mockCreateScraper(...args),
}));
jest.mock("puppeteer-extra", () => ({
    __esModule: true,
    default: {
        use: jest.fn(),
        connect: (...args: unknown[]) => mockConnect(...args),
        launch: (...args: unknown[]) => mockLaunch(...args),
    },
}));
jest.mock("puppeteer-extra-plugin-stealth", () => ({ __esModule: true, default: jest.fn() }));

describe("ScraperService proxy routing", () => {
    const PROXY = "http://100.1.2.3:8888";
    const okResult = { success: true, accounts: [] };

    let env: Record<string, string | undefined>;
    let events: string[];
    let context: { close: jest.Mock };
    let browser: { createBrowserContext: jest.Mock; close: jest.Mock };
    let service: ScraperService;
    let warn: jest.SpyInstance;
    let scrapeOutcomes: Array<() => Promise<unknown>>;

    beforeEach(() => {
        jest.clearAllMocks();
        events = [];
        env = { BROWSERLESS_URL: "ws://bl", CAL_PROXY_URL: PROXY };
        context = {
            close: jest.fn(async () => {
                events.push("close");
            }),
        };
        browser = {
            createBrowserContext: jest.fn(async () => context),
            close: jest.fn(async () => {
                events.push("browser-close");
            }),
        };
        mockConnect.mockResolvedValue(browser);
        mockLaunch.mockResolvedValue(browser);
        scrapeOutcomes = [];
        mockCreateScraper.mockImplementation(() => ({
            scrape: async () => {
                const next = scrapeOutcomes.shift();
                return next ? next() : okResult;
            },
        }));
        const configService = { get: jest.fn((key: string, def?: string) => env[key] ?? def) };
        service = new ScraperService(configService as any, { upload: jest.fn() } as any);
        jest.spyOn(service as any, "captureDebugArtifacts").mockImplementation(async () => {
            events.push("capture");
        });
        warn = jest.spyOn((service as any).logger, "warn").mockImplementation(() => undefined);
        jest.spyOn((service as any).logger, "log").mockImplementation(() => undefined);
    });

    const fail = (errorType: string) => async () => ({ success: false, errorType, errorMessage: "nope" });
    const optionsOf = (call: number) => mockCreateScraper.mock.calls[call][0];

    it("runs visaCal in a proxied context passed as browserContext", async () => {
        await service.scrapeConnection("visaCal", {}, 30);

        expect(browser.createBrowserContext).toHaveBeenCalledWith({ proxyServer: PROXY });
        expect(mockCreateScraper).toHaveBeenCalledTimes(1);
        expect(optionsOf(0).browserContext).toBe(context);
        expect(optionsOf(0).browser).toBeUndefined();
        expect(context.close).toHaveBeenCalledTimes(1);
    });

    it("uses the shared browser for other providers", async () => {
        await service.scrapeConnection("max", {}, 30);

        expect(browser.createBrowserContext).not.toHaveBeenCalled();
        expect(optionsOf(0).browser).toBe(browser);
        expect(optionsOf(0).skipCloseBrowser).toBe(true);
    });

    it("uses the shared browser for visaCal when CAL_PROXY_URL is unset", async () => {
        delete env.CAL_PROXY_URL;
        await service.scrapeConnection("visaCal", {}, 30);

        expect(browser.createBrowserContext).not.toHaveBeenCalled();
        expect(optionsOf(0).browser).toBe(browser);
        expect(optionsOf(0).skipCloseBrowser).toBe(true);
    });

    it("runs visaCal through CAL_PROXY_URL on the local browser too", async () => {
        delete env.BROWSERLESS_URL;
        await service.scrapeConnection("visaCal", {}, 30);

        expect(mockLaunch).toHaveBeenCalledTimes(1);
        expect(browser.createBrowserContext).toHaveBeenCalledWith({ proxyServer: PROXY });
        expect(optionsOf(0).browserContext).toBe(context);
        expect(context.close).toHaveBeenCalledTimes(1);
    });

    it("launches local Chromium through puppeteer-extra and hands it to IBS without letting IBS close it", async () => {
        delete env.BROWSERLESS_URL;
        env.PUPPETEER_EXECUTABLE_PATH = "/usr/bin/chromium";
        env.PUPPETEER_ARGS = "--no-sandbox,--disable-dev-shm-usage";
        await service.scrapeConnection("max", {}, 30);

        expect(mockConnect).not.toHaveBeenCalled();
        expect(mockLaunch).toHaveBeenCalledWith({
            executablePath: "/usr/bin/chromium",
            args: ["--no-sandbox", "--disable-dev-shm-usage"],
            headless: true,
        });
        expect(optionsOf(0).browser).toBe(browser);
        expect(optionsOf(0).skipCloseBrowser).toBe(true);
        expect(optionsOf(0).args).toBeUndefined();
        expect(browser.close).toHaveBeenCalledTimes(1);
        expect(events[events.length - 1]).toBe("browser-close");
    });

    it("lets puppeteer pick its own Chromium and launches with no args when the env is unset", async () => {
        delete env.BROWSERLESS_URL;
        await service.scrapeConnection("max", {}, 30);

        expect(mockLaunch).toHaveBeenCalledWith({ executablePath: undefined, args: [], headless: true });
    });

    it("closes the local browser even when the scrape throws", async () => {
        delete env.BROWSERLESS_URL;
        scrapeOutcomes = [
            async () => {
                throw new Error("boom");
            },
        ];
        await expect(service.scrapeConnection("max", {}, 30)).rejects.toThrow("boom");

        expect(browser.close).toHaveBeenCalledTimes(1);
    });

    it("never closes the shared Browserless browser", async () => {
        await service.scrapeConnection("max", {}, 30);

        expect(mockLaunch).not.toHaveBeenCalled();
        expect(browser.close).not.toHaveBeenCalled();
    });

    it("closes the context after debug capture when the proxied scrape returns success: false", async () => {
        scrapeOutcomes = [fail("GENERIC"), async () => okResult];
        await service.scrapeConnection("visaCal", {}, 30);

        expect(events.slice(0, 2)).toEqual(["capture", "close"]);
        expect(context.close).toHaveBeenCalledTimes(1);
    });

    it("closes the context when the proxied scrape throws, and swallows close errors", async () => {
        context.close.mockRejectedValue(new Error("close failed"));
        scrapeOutcomes = [
            async () => {
                throw new Error("boom");
            },
            async () => okResult,
        ];
        await expect(service.scrapeConnection("visaCal", {}, 30)).resolves.toBeDefined();

        expect(context.close).toHaveBeenCalledTimes(1);
    });

    it("retries once directly after a non-credential proxied failure and returns its results", async () => {
        scrapeOutcomes = [fail("TIMEOUT"), async () => okResult];
        await service.scrapeConnection("visaCal", {}, 30);

        expect(mockCreateScraper).toHaveBeenCalledTimes(2);
        expect(optionsOf(1).browser).toBe(browser);
        expect(optionsOf(1).skipCloseBrowser).toBe(true);
        expect(optionsOf(1).browserContext).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("retrying directly"));
    });

    it("falls back to a direct attempt when creating the proxied context fails", async () => {
        browser.createBrowserContext.mockRejectedValue(new Error("proxy contexts unsupported"));
        await service.scrapeConnection("visaCal", {}, 30);

        expect(mockCreateScraper).toHaveBeenCalledTimes(1);
        expect(optionsOf(0).browser).toBe(browser);
        expect(optionsOf(0).browserContext).toBeUndefined();
        expect(context.close).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("proxy contexts unsupported"));
    });

    it("retries directly after a thrown proxied error", async () => {
        scrapeOutcomes = [
            async () => {
                throw new Error("net::ERR_PROXY_CONNECTION_FAILED");
            },
            async () => okResult,
        ];
        await service.scrapeConnection("visaCal", {}, 30);

        expect(mockCreateScraper).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("ERR_PROXY_CONNECTION_FAILED"));
    });

    it("throws Scraper failed when the direct retry also fails", async () => {
        scrapeOutcomes = [fail("GENERIC"), fail("GENERIC")];

        await expect(service.scrapeConnection("visaCal", {}, 30)).rejects.toThrow(/^Scraper failed: GENERIC/);
        expect(mockCreateScraper).toHaveBeenCalledTimes(2);
    });

    it.each(["INVALID_PASSWORD", "CHANGE_PASSWORD", "ACCOUNT_BLOCKED"])("does not retry on %s", async (errorType) => {
        scrapeOutcomes = [fail(errorType)];

        await expect(service.scrapeConnection("visaCal", {}, 30)).rejects.toThrow(`Scraper failed: ${errorType}`);
        expect(mockCreateScraper).toHaveBeenCalledTimes(1);
        expect(context.close).toHaveBeenCalledTimes(1);
        expect(warn).not.toHaveBeenCalled();
    });
});

describe("ScraperService scraped dates", () => {
    const syntheticTxn = {
        identifier: "1001",
        date: "2026-09-30T21:00:00.000Z",
        processedDate: "2026-09-30T21:00:00.000Z" as string | undefined,
        chargedAmount: -123.45,
        originalAmount: -123.45,
        originalCurrency: "ILS",
        description: "Test cheque withdrawal",
        type: "normal",
    };
    let service: ScraperService;

    const scrapeWith = (txn: Record<string, unknown>) => {
        mockCreateScraper.mockImplementation(() => ({
            scrape: async () => ({ success: true, accounts: [{ accountNumber: "1234", txns: [txn] }] }),
        }));
        return service.scrapeConnection("discount", {}, 30);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Scrapes here run without BROWSERLESS_URL, so they launch (and then close) a local browser.
        mockLaunch.mockResolvedValue({ close: jest.fn(async () => undefined) });
        const configService = { get: jest.fn((_key: string, def?: string) => def) };
        service = new ScraperService(
            configService as unknown as ConfigService,
            { upload: jest.fn() } as unknown as ConstructorParameters<typeof ScraperService>[1],
        );
        jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    });

    it("stores the Israel calendar day, and keeps the legacy UTC-truncated value for healing", async () => {
        const { candidates } = await scrapeWith(syntheticTxn);

        expect(candidates[0].transactionDate).toEqual(new Date("2026-10-01T00:00:00.000Z"));
        expect(candidates[0].postedDate).toEqual(new Date("2026-10-01T00:00:00.000Z"));
        expect(candidates[0].legacyTransactionDate).toEqual(new Date("2026-09-30T00:00:00.000Z"));
        expect(candidates[0].legacyPostedDate).toEqual(new Date("2026-09-30T00:00:00.000Z"));
    });

    it("keeps a UTC-midnight date on the same day", async () => {
        const { candidates } = await scrapeWith({ ...syntheticTxn, date: "2026-10-01T00:00:00.000Z" });

        expect(candidates[0].transactionDate).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    });

    it("maps a missing processedDate to null postedDate and legacyPostedDate", async () => {
        const { candidates } = await scrapeWith({ ...syntheticTxn, processedDate: undefined });

        expect(candidates[0].postedDate).toBeNull();
        expect(candidates[0].legacyPostedDate).toBeNull();
    });

    it("refuses a provider with no declared source timezone before scraping", async () => {
        await expect(service.scrapeConnection("unknownBank", {}, 30)).rejects.toThrow(/No source date timezone/);
        expect(mockCreateScraper).not.toHaveBeenCalled();
    });
});

describe("ScraperService.storeArtifact", () => {
    const debugArtifacts = { upload: jest.fn() };
    let dir: string;
    const store = (service: ScraperService) =>
        (service as unknown as { storeArtifact(...args: unknown[]): Promise<string> }).storeArtifact(
            "scraper-debug/c/2026-01-01/ts/page.html",
            Buffer.from("html"),
            "text/html",
            "c",
            "2026-01-01",
            "ts",
            "page.html",
        );
    const newService = (get: (key: string) => string | undefined) =>
        new ScraperService(
            { get: jest.fn(get) } as unknown as ConfigService,
            debugArtifacts as unknown as ConstructorParameters<typeof ScraperService>[1],
        );

    beforeEach(() => {
        jest.clearAllMocks();
        dir = mkdtempSync(join(tmpdir(), "scraper-artifacts-"));
        (resolveDebugArtifactsDir as jest.Mock).mockReturnValue(dir);
        debugArtifacts.upload.mockResolvedValue(null);
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("stores nothing locally unless STORE_SCRAPER_DEBUG_LOCALLY is true", async () => {
        expect(await store(newService(() => undefined))).toBe("<skipped>");
        expect(existsSync(join(dir, "c"))).toBe(false);
    });

    it("writes under resolveDebugArtifactsDir() when STORE_SCRAPER_DEBUG_LOCALLY is true", async () => {
        const service = newService((key) => (key === "STORE_SCRAPER_DEBUG_LOCALLY" ? "true" : undefined));

        const expected = join(dir, "c", "2026-01-01", "ts", "page.html");
        expect(await store(service)).toBe(expected);
        expect(readFileSync(expected, "utf-8")).toBe("html");
    });
});
