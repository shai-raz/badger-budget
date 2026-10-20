import { describe, expect, it } from "vitest";
import { toLocalIsoDate } from "./localDate";

describe("toLocalIsoDate", () => {
    it("formats a local date", () => {
        expect(toLocalIsoDate(new Date(2026, 9, 9))).toBe("2026-10-09");
    });

    it("keeps the local day late in the evening (toISOString would roll over in New York)", () => {
        expect(toLocalIsoDate(new Date(2026, 9, 9, 23, 30))).toBe("2026-10-09");
    });

    it("keeps the local day just after midnight", () => {
        expect(toLocalIsoDate(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
    });

    it("pads single-digit month and day", () => {
        expect(toLocalIsoDate(new Date(2026, 2, 4))).toBe("2026-03-04");
    });
});
