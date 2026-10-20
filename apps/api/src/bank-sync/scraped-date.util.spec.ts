import { getSourceTimezone } from "@badger/shared-data";
import { loadIbsInternals } from "./ibs-test-helpers";
import { legacyStoredDate, toSourceCalendarDate } from "./scraped-date.util";

const { moment, BaseScraper } = loadIbsInternals();

describe("scraped-date.util", () => {
    afterAll(() => {
        moment.tz.setDefault();
    });

    it.each([
        ["2026-09-30T21:00:00.000Z", "2026-10-01T00:00:00.000Z"],
        ["2026-11-30T22:00:00.000Z", "2026-12-01T00:00:00.000Z"],
        ["2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"],
        ["2026-10-01T04:00:00.000Z", "2026-10-01T00:00:00.000Z"],
        ["2026-10-01", "2026-10-01T00:00:00.000Z"],
        ["2026-10-01T20:30:00.000Z", "2026-10-01T00:00:00.000Z"],
    ])("toSourceCalendarDate(%s, Asia/Jerusalem) -> %s", (input, expected) => {
        expect(toSourceCalendarDate(input, "Asia/Jerusalem").toISOString()).toBe(expected);
    });

    it("legacyStoredDate keeps the UTC day", () => {
        expect(legacyStoredDate("2026-09-30T21:00:00.000Z").toISOString()).toBe("2026-09-30T00:00:00.000Z");
    });

    it("throws on unparseable values", () => {
        expect(() => toSourceCalendarDate("garbage", "Asia/Jerusalem")).toThrow("Unparseable scraped date");
        expect(() => legacyStoredDate("garbage")).toThrow("Unparseable scraped date");
    });

    describe("real IBS path", () => {
        beforeAll(async () => {
            await new BaseScraper({ companyId: "discount" }).initialize();
        });

        it.each([
            ["20261001", "YYYYMMDD", "2026-09-30", "2026-10-01"],
            ["01/10/2026", "DD/MM/YYYY", "2026-09-30", "2026-10-01"],
            ["20261201", "YYYYMMDD", "2026-11-30", "2026-12-01"],
        ])("IBS parse of %s (%s)", (input, format, legacy, expected) => {
            const iso = moment(input, format).toISOString();
            expect(legacyStoredDate(iso).toISOString()).toBe(`${legacy}T00:00:00.000Z`);
            expect(toSourceCalendarDate(iso, getSourceTimezone("discount")!).toISOString()).toBe(
                `${expected}T00:00:00.000Z`,
            );
        });
    });
});
