import { describe, expect, it } from "vitest";
import { formatCurrency, formatCurrencyRounded } from "./currency";

describe("formatCurrency", () => {
    it("formats with 2 decimals by default", () => {
        expect(formatCurrency(1300.5)).toBe("₪1,300.50");
    });

    it("falls back to ILS when no currency code is given", () => {
        expect(formatCurrency(10)).toContain("₪");
    });

    it("respects a given currency code", () => {
        expect(formatCurrency(10, "USD")).toBe("$10.00");
    });
});

describe("formatCurrencyRounded", () => {
    it("drops decimals, rounding to the nearest whole unit", () => {
        expect(formatCurrencyRounded(1300.55)).toBe("₪1,301");
    });

    it("drops a trailing .00 with no decimals shown", () => {
        expect(formatCurrencyRounded(3000)).toBe("₪3,000");
    });

    it("respects a given currency code", () => {
        expect(formatCurrencyRounded(10.6, "USD")).toBe("$11");
    });
});
