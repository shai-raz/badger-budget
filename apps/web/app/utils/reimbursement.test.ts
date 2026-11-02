import { describe, expect, it, vi } from "vitest";
import type { IReimbursementCandidate, ITransactionReimbursement, ITransactionReimbursementLink } from "@badger/types";
import {
    awaitingLinkPreview,
    bandLinkAccessibleName,
    candidateMetaLine,
    defaultApplyAmount,
    displayAmount,
    incomeRemainderLine,
    isAllocatedIncome,
    linkActionState,
    linkMenuItem,
    editDialogReimbursementLine,
    linkRemovalWarning,
    linksRemovedSuffix,
    maxLinkAmount,
    otherGroupLabel,
    remainingCaption,
    reimbursementSubLine,
    remainingToLink,
    rowAmountClass,
    suggestedHeading,
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

    it("keeps the income colour for an unallocated income", () => {
        expect(rowAmountClass(tx({ type: "income" }))).toBe("text-income");
    });

    it("keeps the expense colour for an expense, even one with reimbursements", () => {
        expect(rowAmountClass(tx({ reimbursement: reimbursement({ allocatedActive: 300 }) }))).toBe("text-expense");
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

describe("bandLinkAccessibleName", () => {
    it("adds no override at md and up, where the visible label is the name", () => {
        expect(bandLinkAccessibleName("Mark as reimbursement", true)).toBeUndefined();
        expect(bandLinkAccessibleName("Link reimbursement", true)).toBeUndefined();
    });

    it("keeps the label below md when it already starts with the visible Link", () => {
        expect(bandLinkAccessibleName("Link reimbursement", false)).toBe("Link reimbursement");
    });

    it("prefixes the income label below md so the name contains the visible Link", () => {
        const name = bandLinkAccessibleName("Mark as reimbursement", false);
        expect(name).toBe("Link: Mark as reimbursement");
        expect(name?.startsWith("Link")).toBe(true);
    });
});

describe("linkMenuItem", () => {
    it("is null for a transfer or mirror row", () => {
        const open = () => {};
        expect(linkMenuItem(tx({ type: "transfer", transferDirection: "out" }), open)).toBeNull();
        expect(
            linkMenuItem(tx({ type: "transfer", transferDirection: "in", counterpartOfId: "src" }), open),
        ).toBeNull();
    });

    it("runs the open callback for an enabled expense", () => {
        const open = vi.fn();
        const item = linkMenuItem(tx(), open);
        expect(item).toMatchObject({ label: "Link reimbursement", icon: "pi pi-link" });
        expect(item).not.toHaveProperty("disabled");
        item?.command();
        expect(open).toHaveBeenCalledOnce();
    });

    it("carries the disabled state and tooltip for a fully reimbursed expense", () => {
        const expense = tx({ reimbursement: reimbursement({ allocatedTotal: 600, allocatedActive: 600 }) });
        expect(linkMenuItem(expense, () => {})).toMatchObject({
            label: "Link reimbursement",
            disabled: true,
            tooltip: "Fully reimbursed",
        });
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

describe("maxLinkAmount", () => {
    it("is the link's own amount plus the room left on this row", () => {
        const expense = tx({
            amount: 600,
            reimbursement: reimbursement({
                allocatedTotal: 300,
                allocatedActive: 300,
                links: [link({ amount: 150 }), link({ allocationId: "b", amount: 150 })],
            }),
        });
        // Room on the expense: 600 - 300 = 300. The other side has 450 left, so 300 is the limit.
        expect(maxLinkAmount(expense, link({ amount: 150, transactionRemaining: 450 }))).toBe(450);
    });

    it("is capped by the other side's remaining balance when that is smaller", () => {
        const expense = tx({
            amount: 600,
            reimbursement: reimbursement({ allocatedTotal: 150, allocatedActive: 150, links: [link({ amount: 150 })] }),
        });
        // Room on the expense: 450. The other side only has 40 left beyond this link.
        expect(maxLinkAmount(expense, link({ amount: 150, transactionRemaining: 40 }))).toBe(190);
    });

    it("never drops below the link's own amount", () => {
        const expense = tx({
            amount: 100,
            reimbursement: reimbursement({ allocatedTotal: 100, allocatedActive: 100, links: [link({ amount: 100 })] }),
        });
        expect(maxLinkAmount(expense, link({ amount: 100, transactionRemaining: 0 }))).toBe(100);
    });

    it("stays cents-exact", () => {
        const expense = tx({
            amount: 0.3,
            reimbursement: reimbursement({ allocatedTotal: 0.1, allocatedActive: 0.1, links: [link({ amount: 0.1 })] }),
        });
        expect(maxLinkAmount(expense, link({ amount: 0.1, transactionRemaining: 1 }))).toBe(0.3);
    });
});

describe("editDialogReimbursementLine", () => {
    const withLinks = (role: "expense" | "income", count: number, allocatedActive: number) =>
        reimbursement({
            role,
            allocatedTotal: allocatedActive,
            allocatedActive,
            links: Array.from({ length: count }, (_, i) => link({ allocationId: `a${i}` })),
        });

    it("is null when the row has no links", () => {
        expect(editDialogReimbursementLine({ currency: ILS, reimbursement: null })).toBeNull();
        expect(editDialogReimbursementLine({ currency: ILS, reimbursement: withLinks("expense", 0, 0) })).toBeNull();
    });

    it("shows the paid-back total on an expense", () => {
        expect(editDialogReimbursementLine({ currency: ILS, reimbursement: withLinks("expense", 2, 300) })).toBe(
            "Reimbursed ₪300.00",
        );
    });

    it("counts a hidden expense's links at their full total, not the active total", () => {
        const hidden = reimbursement({
            role: "expense",
            allocatedTotal: 300,
            allocatedActive: 0,
            links: [link({ allocationId: "a0" })],
        });
        expect(editDialogReimbursementLine({ currency: ILS, reimbursement: hidden })).toBe("Reimbursed ₪300.00");
    });

    it("counts expenses on an income, singular and plural", () => {
        expect(editDialogReimbursementLine({ currency: ILS, reimbursement: withLinks("income", 1, 150) })).toBe(
            "Reimburses 1 expense",
        );
        expect(editDialogReimbursementLine({ currency: ILS, reimbursement: withLinks("income", 3, 300) })).toBe(
            "Reimburses 3 expenses",
        );
    });
});

describe("candidateMetaLine", () => {
    const candidate = (
        overrides: Partial<Pick<IReimbursementCandidate, "additionalDescription" | "category">> = {},
    ) => ({
        transactionDate: new Date("2026-03-01T12:00:00Z"),
        additionalDescription: "Team lunch",
        category: { id: "cat-1", name: "Food", color: null, icon: null },
        ...overrides,
    });

    it("joins date, additional description and category with a middle dot", () => {
        expect(candidateMetaLine(candidate())).toBe("Mar 1, 2026 · Team lunch · Food");
    });

    it("skips an empty or blank additional description and a missing category", () => {
        expect(candidateMetaLine(candidate({ additionalDescription: "   ", category: null }))).toBe("Mar 1, 2026");
        expect(candidateMetaLine(candidate({ additionalDescription: null }))).toBe("Mar 1, 2026 · Food");
    });
});

describe("picker headings", () => {
    it("names the threshold by the source type", () => {
        expect(suggestedHeading("expense", 300, "ILS")).toBe("Suggested · incomes ≤ ₪300.00");
        expect(suggestedHeading("income", 200, "ILS")).toBe("Suggested · expenses ≥ ₪200.00");
    });

    it("labels the other group with the opposite side", () => {
        expect(otherGroupLabel("expense")).toBe("Other incomes");
        expect(otherGroupLabel("income")).toBe("Other expenses");
    });

    it("captions what the source still has to reimburse or allocate", () => {
        expect(remainingCaption("expense", 300, "ILS")).toBe("₪300.00 left to reimburse");
        expect(remainingCaption("income", 200, "ILS")).toBe("₪200.00 left to allocate");
    });
});

describe("awaitingLinkPreview", () => {
    const idle = { enabled: true, isPending: false, isFetching: false, isError: false };

    it("blocks confirm while the preview is loading for an open dialog", () => {
        expect(awaitingLinkPreview({ ...idle, isPending: true })).toBe(true);
        expect(awaitingLinkPreview({ ...idle, isFetching: true })).toBe(true);
    });

    it("releases confirm once the preview has settled", () => {
        expect(awaitingLinkPreview(idle)).toBe(false);
    });

    it("does not block when the preview is disabled (dialog closed or no description)", () => {
        expect(awaitingLinkPreview({ ...idle, enabled: false, isPending: true })).toBe(false);
    });

    it("releases confirm when the preview errors, falling back like Apply all", () => {
        expect(awaitingLinkPreview({ ...idle, isPending: true, isError: true })).toBe(false);
    });
});
