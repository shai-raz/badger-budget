import { BANK_PROVIDERS, IBS_DATE_TIMEZONE, SOURCE_TIMEZONE_BY_COMPANY, getSourceTimezone } from "@badger/shared-data";
import { loadIbsInternals } from "./ibs-test-helpers";

const { moment, BaseScraper } = loadIbsInternals();

describe("IBS date timezone", () => {
    afterAll(() => {
        moment.tz.setDefault();
    });

    it("IBS forces its default moment zone to IBS_DATE_TIMEZONE", async () => {
        // If this fails, IBS stopped forcing Asia/Jerusalem: revisit SOURCE_TIMEZONE_BY_COMPANY and the
        // scraper date normalization.
        await new BaseScraper({ companyId: "discount" }).initialize();
        expect(moment.defaultZone?.name).toBe(IBS_DATE_TIMEZONE);
    });

    it("every provider is served by IBS", () => {
        // If this fails you added a non-IBS provider: declare its own library constant and canary
        // deliberately, and update this test.
        expect(Object.values(SOURCE_TIMEZONE_BY_COMPANY).every((z) => z === IBS_DATE_TIMEZONE)).toBe(true);
        expect(Object.keys(SOURCE_TIMEZONE_BY_COMPANY).sort()).toEqual(BANK_PROVIDERS.map((p) => p.companyId).sort());
    });

    it("getSourceTimezone resolves known ids and returns null otherwise", () => {
        expect(getSourceTimezone("discount")).toBe(IBS_DATE_TIMEZONE);
        expect(getSourceTimezone("nope")).toBeNull();
    });
});
