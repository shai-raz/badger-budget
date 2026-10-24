import { describe, expect, it } from "vitest";
import { ledgerBalanceDialogCopy, ledgerBalancePrefill } from "./ledgerBalanceDialog";

describe("ledgerBalanceDialogCopy", () => {
    it("uses savings copy for a savings account", () => {
        expect(ledgerBalanceDialogCopy("savings")).toEqual({
            header: "Update savings balance",
            label: "Current balance",
            help: "We'll record the difference as a savings adjustment (a transfer in or out).",
            successSummary: "Savings balance updated",
            errorFallback: "Could not update the savings balance",
        });
    });

    it("uses the cash copy for a cash account", () => {
        expect(ledgerBalanceDialogCopy("cash")).toEqual({
            header: "Update cash balance",
            label: "Cash in hand",
            help: "We'll record the difference: untracked cash spending if you have less, a cash adjustment if you have more.",
            successSummary: "Cash balance updated",
            errorFallback: "Could not update the cash balance",
        });
    });
});

describe("ledgerBalancePrefill", () => {
    it("prefills a savings balance", () => {
        expect(ledgerBalancePrefill({ type: "savings", balance: 1200 })).toBe(1200);
    });

    it("prefills a cash balance", () => {
        expect(ledgerBalancePrefill({ type: "cash", balance: 56.6 })).toBe(56.6);
    });

    it("prefills zero", () => {
        expect(ledgerBalancePrefill({ type: "savings", balance: 0 })).toBe(0);
    });

    it("is null for a bank account", () => {
        expect(ledgerBalancePrefill({ type: "bank", balance: 500 })).toBeNull();
    });

    it("is null for a negative or missing balance", () => {
        expect(ledgerBalancePrefill({ type: "savings", balance: -3 })).toBeNull();
        expect(ledgerBalancePrefill({ type: "cash", balance: null })).toBeNull();
    });

    it("is null without an account", () => {
        expect(ledgerBalancePrefill(null)).toBeNull();
    });
});
