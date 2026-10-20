import { describe, expect, it } from "vitest";
import { transactionTypeLabel } from "./formatters";

describe("transactionTypeLabel", () => {
    it.each([
        ["expense", "Expense"],
        ["income", "Income"],
        ["transfer", "Transfer"],
    ] as const)("maps %s to %s", (type, label) => {
        expect(transactionTypeLabel(type)).toBe(label);
    });
});
