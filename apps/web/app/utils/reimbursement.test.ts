import { describe, expect, it } from "vitest";
import type { ITransactionReimbursement, ITransactionReimbursementLink } from "@badger/types";
import {
    defaultApplyAmount,
    displayAmount,
    incomeRemainderLine,
    isAllocatedIncome,
    linkActionState,
    linkRemovalWarning,
    linksRemovedSuffix,
    reimbursementSubLine,
    remainingToLink,
    rowAmountClass,
    type ReimbursementTx,
} from "./reimbursement";

const link = (overrides: Partial<ITransactionReimbursementLink> = {}): ITransactionReimbursementLink => ({
    allocationId: "alloc-1",
    transactionId: "tx-other",
    description: "Taizu restaurant",
    transactionAmount: 600,
    transactionRemaining: 450,
    transactionDate: new Date("2026-03-01"),
    amount: 150,
    active: true,
    ...overrides,
});

const reimbursement = (overrides: Partial<ITransactionReimbursement> = {}): ITransactionReimbursement => ({
    role: "expense",
    allocatedTotal: 0,
    allocatedActive: 0,
    links: [],
    ...overrides,
});

const ILS = { code: "ILS" };

type TestTx = ReimbursementTx & { counterpartOfId: string | null };

const tx = (overrides: Partial<TestTx> = {}): TestTx => ({
    type: "expense" as const,
    amount: 600,
    hidden: false,
    reimbursement: null,
    transferDirection: null,
    currency: ILS,
    counterpartOfId: null,
    ...overrides,
});

describe("displayAmount", () => {
    it("nets an expense down by its active reimbursements", () => {
        const expense = tx({
            reimbursement: reimbursement({
                allocatedTotal: 300,
                allocatedActive: 300,
                links: [link({ amount: 150 }), link({ allocationId: "alloc-2", amount: 150 })],
            }),
        });
        expect(displayAmount(expense)).toBe(300);
    });

    it("returns the full amount for an expense with no reimbursement", () => {
        expect(displayAmount(tx())).toBe(600);
    });

    it("ignores inactive links for an expense's displayed amount", () => {
        const expense = tx({
            reimbursement: reimbursement({ allocatedTotal: 150, allocatedActive: 0 }),
        });
        expect(displayAmount(expense)).toBe(600);
    });

    it("clamps an over-reimbursed expense at zero", () => {
        const expense = tx({
            amount: 100,
            reimbursement: reimbursement({ allocatedActive: 150 }),
        });
        expect(displayAmount(expense)).toBe(0);
    });

    it("returns the full amount for an income, even when it is allocated", () => {
        const income = tx({
            type: "income",
            amount: 350,
            reimbursement: reimbursement({ role: "income", allocatedActive: 300 }),
        });
        expect(displayAmount(income)).toBe(350);
    });

    it("returns the full amount for a transfer", () => {
        expect(displayAmount(tx({ type: "transfer", transferDirection: "out" }))).toBe(600);
    });

    it("stays exact at cent precision", () => {
        const expense = tx({
            amount: 10.1,
            reimbursement: reimbursement({ allocatedActive: 0.2 }),
        });
        expect(displayAmount(expense)).toBe(9.9);
    });
});

describe("isAllocatedIncome", () => {
    it("is true for an income with active allocations", () => {
        const income = tx({ type: "income", reimbursement: reimbursement({ role: "income", allocatedActive: 300 }) });
        expect(isAllocatedIncome(income)).toBe(true);
    });

    it("is false for an income with no allocations", () => {
        expect(isAllocatedIncome(tx({ type: "income" }))).toBe(false);
    });

    it("is false for an income whose links are all inactive", () => {
        const income = tx({
            type: "income",
            reimbursement: reimbursement({ role: "income", allocatedTotal: 300, allocatedActive: 0 }),
        });
        expect(isAllocatedIncome(income)).toBe(false);
    });

    it("is false for an expense even with allocations", () => {
        expect(isAllocatedIncome(tx({ reimbursement: reimbursement({ allocatedActive: 300 }) }))).toBe(false);
    });
});

describe("rowAmountClass", () => {
    it("mutes an allocated income", () => {
        const income = tx({
            type: "income",
            reimbursement: reimbursement({ role: "income", allocatedActive: 300 }),
        });
        expect(rowAmountClass(income)).toBe("text-muted-color");
    });

    it("keeps teal for an unallocated income", () => {
        expect(rowAmountClass(tx({ type: "income" }))).toBe("text-teal-500");
    });

    it("keeps rose for an expense, even one with reimbursements", () => {
        expect(rowAmountClass(tx({ reimbursement: reimbursement({ allocatedActive: 300 }) }))).toBe("text-rose-500");
    });

    it("keeps the neutral transfer class for a transfer", () => {
        expect(rowAmountClass(tx({ type: "transfer", transferDirection: "in" }))).toBe(
            "text-surface-600 dark:text-surface-300",
        );
    });
});

describe("reimbursementSubLine", () => {
    it("shows the net-of-gross line on an expense with active reimbursements", () => {
        const expense = tx({
            reimbursement: reimbursement({ allocatedActive: 300, allocatedTotal: 300 }),
        });
        expect(reimbursementSubLine(expense)).toBe("↩ ₪300.00 of ₪600.00 back");
    });

    it("returns null for an expense with no reimbursement", () => {
        expect(reimbursementSubLine(tx())).toBeNull();
    });

    it("returns null for an expense whose links are all inactive", () => {
        const expense = tx({
            reimbursement: reimbursement({ allocatedTotal: 150, allocatedActive: 0, links: [link({ active: false })] }),
        });
        expect(reimbursementSubLine(expense)).toBeNull();
    });

    it("names the single expense an income reimburses", () => {
        const income = tx({
            type: "income",
            amount: 150,
            reimbursement: reimbursement({ role: "income", allocatedActive: 150, links: [link()] }),
        });
        expect(reimbursementSubLine(income)).toBe("reimburses Taizu restaurant");
    });

    it("counts the expenses an income reimburses when there are several", () => {
        const income = tx({
            type: "income",
            amount: 200,
            reimbursement: reimbursement({
                role: "income",
                allocatedActive: 200,
                links: [
                    link({ allocationId: "a", description: "Dinner", amount: 120 }),
                    link({ allocationId: "b", description: "Groceries", amount: 80 }),
                ],
            }),
        });
        expect(reimbursementSubLine(income)).toBe("₪200.00 reimburses 2 expenses");
    });

    it("counts only active links for an income", () => {
        const income = tx({
            type: "income",
            amount: 200,
            reimbursement: reimbursement({
                role: "income",
                allocatedActive: 80,
                links: [
                    link({ allocationId: "a", description: "Dinner", amount: 120, active: false }),
                    link({ allocationId: "b", description: "Groceries", amount: 80, active: true }),
                ],
            }),
        });
        expect(reimbursementSubLine(income)).toBe("reimburses Groceries");
    });

    it("returns null for an income with no links", () => {
        expect(reimbursementSubLine(tx({ type: "income" }))).toBeNull();
    });

    it("returns null for a transfer", () => {
        expect(reimbursementSubLine(tx({ type: "transfer", transferDirection: "out" }))).toBeNull();
    });
});

describe("incomeRemainderLine", () => {
    it("shows the income still counted on a partly allocated income", () => {
        const income = tx({
            type: "income",
            amount: 350,
            reimbursement: reimbursement({ role: "income", allocatedActive: 300, links: [link({ amount: 300 })] }),
        });
        expect(incomeRemainderLine(income)).toBe("₪50.00 income");
    });

    it("returns null when an income is fully allocated", () => {
        const income = tx({
            type: "income",
            amount: 300,
            reimbursement: reimbursement({ role: "income", allocatedActive: 300 }),
        });
        expect(incomeRemainderLine(income)).toBeNull();
    });

    it("returns null for an unallocated income", () => {
        expect(incomeRemainderLine(tx({ type: "income", amount: 350 }))).toBeNull();
    });

    it("returns null for an expense", () => {
        expect(incomeRemainderLine(tx({ reimbursement: reimbursement({ allocatedActive: 300 }) }))).toBeNull();
    });

    it("ignores inactive links when working out the remainder", () => {
        const income = tx({
            type: "income",
            amount: 350,
            reimbursement: reimbursement({ role: "income", allocatedTotal: 300, allocatedActive: 0 }),
        });
        expect(incomeRemainderLine(income)).toBeNull();
    });
});

describe("remainingToLink", () => {
    it("is the full amount when nothing is linked", () => {
        expect(remainingToLink(tx())).toBe(600);
    });

    it("subtracts every link, active or not", () => {
        const expense = tx({
            reimbursement: reimbursement({ allocatedTotal: 450, allocatedActive: 300 }),
        });
        expect(remainingToLink(expense)).toBe(150);
    });

    it("clamps at zero when over-allocated", () => {
        const expense = tx({ amount: 100, reimbursement: reimbursement({ allocatedTotal: 150 }) });
        expect(remainingToLink(expense)).toBe(0);
    });

    it("stays exact at cent precision", () => {
        const expense = tx({ amount: 10.1, reimbursement: reimbursement({ allocatedTotal: 0.1 }) });
        expect(remainingToLink(expense)).toBe(10);
    });
});

describe("linkActionState", () => {
    it("is labelled Link reimbursement for an expense", () => {
        expect(linkActionState(tx())).toEqual({ visible: true, label: "Link reimbursement", disabled: false });
    });

    it("is labelled Mark as reimbursement for an income", () => {
        expect(linkActionState(tx({ type: "income" }))).toEqual({
            visible: true,
            label: "Mark as reimbursement",
            disabled: false,
        });
    });

    it("is hidden for a transfer", () => {
        expect(linkActionState(tx({ type: "transfer", transferDirection: "out" })).visible).toBe(false);
    });

    it("is hidden for a cash-wallet mirror row", () => {
        const mirror = tx({ type: "transfer", transferDirection: "in", counterpartOfId: "src-1" });
        expect(linkActionState(mirror).visible).toBe(false);
    });

    it("is disabled with an unhide tooltip on a hidden row", () => {
        expect(linkActionState(tx({ hidden: true }))).toEqual({
            visible: true,
            label: "Link reimbursement",
            disabled: true,
            tooltip: "Unhide this transaction to link reimbursements",
        });
    });

    it("is disabled as Fully reimbursed when an expense has nothing left to link", () => {
        const expense = tx({ reimbursement: reimbursement({ allocatedTotal: 600, allocatedActive: 600 }) });
        expect(linkActionState(expense)).toEqual({
            visible: true,
            label: "Link reimbursement",
            disabled: true,
            tooltip: "Fully reimbursed",
        });
    });

    it("is disabled as Fully allocated when an income has nothing left to link", () => {
        const income = tx({
            type: "income",
            amount: 300,
            reimbursement: reimbursement({ role: "income", allocatedTotal: 300, allocatedActive: 300 }),
        });
        expect(linkActionState(income)).toEqual({
            visible: true,
            label: "Mark as reimbursement",
            disabled: true,
            tooltip: "Fully allocated",
        });
    });

    it("prefers the hidden reason over the fully-linked reason", () => {
        const expense = tx({
            hidden: true,
            reimbursement: reimbursement({ allocatedTotal: 600, allocatedActive: 0 }),
        });
        expect(linkActionState(expense).tooltip).toBe("Unhide this transaction to link reimbursements");
    });

    it("stays enabled while a partial amount is still linkable", () => {
        const expense = tx({ reimbursement: reimbursement({ allocatedTotal: 450, allocatedActive: 450 }) });
        expect(linkActionState(expense).disabled).toBe(false);
    });
});

describe("defaultApplyAmount", () => {
    it("takes the smaller of the two remainders", () => {
        expect(defaultApplyAmount(120, 300)).toBe(120);
        expect(defaultApplyAmount(300, 120)).toBe(120);
    });

    it("returns the shared value when both remainders match", () => {
        expect(defaultApplyAmount(75, 75)).toBe(75);
    });

    it("is cents-exact", () => {
        expect(defaultApplyAmount(10.1, 10.09)).toBe(10.09);
    });

    it("never goes below zero", () => {
        expect(defaultApplyAmount(-5, 100)).toBe(0);
    });
});

describe("linkRemovalWarning", () => {
    it("is null when there is no preview", () => {
        expect(linkRemovalWarning(null)).toBeNull();
        expect(linkRemovalWarning(undefined)).toBeNull();
    });

    it("is null when no links would be removed", () => {
        expect(linkRemovalWarning({ linkedTransactions: 0, links: 0 })).toBeNull();
    });

    it("warns with the plural wording for several linked transactions", () => {
        expect(linkRemovalWarning({ linkedTransactions: 2, links: 3 })).toBe(
            "2 of these transactions are linked as reimbursements. Marking them removes those links, and the transactions they're linked to go back to full amounts.",
        );
    });

    it("uses the singular wording for one linked transaction", () => {
        expect(linkRemovalWarning({ linkedTransactions: 1, links: 1 })).toBe(
            "1 of these transactions is linked as a reimbursement. Marking it removes that link, and the transaction it's linked to goes back to its full amount.",
        );
    });
});

describe("linksRemovedSuffix", () => {
    it("is empty when links are undefined", () => {
        expect(linksRemovedSuffix(undefined)).toBe("");
    });

    it("is empty when no links were removed", () => {
        expect(linksRemovedSuffix(0)).toBe("");
    });

    it("uses the singular for one link", () => {
        expect(linksRemovedSuffix(1)).toBe(" · 1 reimbursement link removed");
    });

    it("uses the plural for several links", () => {
        expect(linksRemovedSuffix(3)).toBe(" · 3 reimbursement links removed");
    });
});

describe("spec examples", () => {
    it("600 expense with 150 + 150 linked nets to 300 with a back line", () => {
        const expense = tx({
            amount: 600,
            reimbursement: reimbursement({
                allocatedTotal: 300,
                allocatedActive: 300,
                links: [link({ amount: 150 }), link({ allocationId: "b", amount: 150 })],
            }),
        });
        expect(displayAmount(expense)).toBe(300);
        expect(reimbursementSubLine(expense)).toBe("↩ ₪300.00 of ₪600.00 back");
        expect(remainingToLink(expense)).toBe(300);
    });

    it("350 income with 300 allocated is muted with a 50 remainder", () => {
        const income = tx({
            type: "income",
            amount: 350,
            reimbursement: reimbursement({
                role: "income",
                allocatedTotal: 300,
                allocatedActive: 300,
                links: [link()],
            }),
        });
        expect(rowAmountClass(income)).toBe("text-muted-color");
        expect(incomeRemainderLine(income)).toBe("₪50.00 income");
    });

    it("200 income split 120/80 across two expenses shows the count and no remainder", () => {
        const income = tx({
            type: "income",
            amount: 200,
            reimbursement: reimbursement({
                role: "income",
                allocatedTotal: 200,
                allocatedActive: 200,
                links: [
                    link({ allocationId: "a", description: "Dinner", amount: 120 }),
                    link({ allocationId: "b", description: "Groceries", amount: 80 }),
                ],
            }),
        });
        expect(reimbursementSubLine(income)).toBe("₪200.00 reimburses 2 expenses");
        expect(incomeRemainderLine(income)).toBeNull();
    });

    it("inactive links are ignored for display but still count toward remainingToLink", () => {
        const expense = tx({
            amount: 600,
            reimbursement: reimbursement({
                allocatedTotal: 150,
                allocatedActive: 0,
                links: [link({ active: false })],
            }),
        });
        expect(displayAmount(expense)).toBe(600);
        expect(reimbursementSubLine(expense)).toBeNull();
        expect(remainingToLink(expense)).toBe(450);
    });
});
