import { describe, expect, it } from "vitest";
import { transactionCountText } from "./transactionCount";

describe("transactionCountText", () => {
    it("uses the singular for exactly one transaction", () => {
        expect(transactionCountText(1)).toBe("1 transaction");
    });

    it("uses the plural for zero and many", () => {
        expect(transactionCountText(0)).toBe("0 transactions");
        expect(transactionCountText(42)).toBe("42 transactions");
    });

    it("groups thousands with the locale separator", () => {
        expect(transactionCountText(1234)).toBe(`${(1234).toLocaleString()} transactions`);
    });
});
