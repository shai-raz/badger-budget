import { describe, expect, it } from "vitest";
import type { ITransactionReimbursement, ITransactionReimbursementLink } from "@badger/types";
import { formatCurrency } from "./currency";
import type { ReimbursementTx } from "./reimbursement";
import { reimbursementReceiptLines } from "./reimbursementReceipt";

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
    links: [link()],
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

describe("reimbursementReceiptLines", () => {
    it("shows Paid and a teal Paid back line for a partly reimbursed expense", () => {
        const lines = reimbursementReceiptLines(
            tx({ reimbursement: reimbursement({ allocatedTotal: 300, allocatedActive: 300 }) }),
        );
        expect(lines).toEqual([
            { label: "Paid", value: formatCurrency(600, "ILS"), valueClass: "" },
            { label: "Paid back", value: `−${formatCurrency(300, "ILS")}`, valueClass: "text-income" },
        ]);
    });

    it("shows the full amount paid back for a fully reimbursed expense", () => {
        const lines = reimbursementReceiptLines(
            tx({ reimbursement: reimbursement({ allocatedTotal: 600, allocatedActive: 600 }) }),
        );
        expect(lines?.[0]).toEqual({ label: "Paid", value: formatCurrency(600, "ILS"), valueClass: "" });
        expect(lines?.[1]).toEqual({
            label: "Paid back",
            value: `−${formatCurrency(600, "ILS")}`,
            valueClass: "text-income",
        });
    });

    it("shows a zero Paid back line when the links are present but none are active", () => {
        const lines = reimbursementReceiptLines(
            tx({
                reimbursement: reimbursement({
                    allocatedTotal: 150,
                    allocatedActive: 0,
                    links: [link({ active: false })],
                }),
            }),
        );
        expect(lines?.[1]).toEqual({
            label: "Paid back",
            value: `−${formatCurrency(0, "ILS")}`,
            valueClass: "text-income",
        });
    });

    it("shows Received and a muted Applied line for an income", () => {
        const lines = reimbursementReceiptLines(
            tx({
                type: "income",
                amount: 350,
                reimbursement: reimbursement({ role: "income", allocatedTotal: 300, allocatedActive: 300 }),
            }),
        );
        expect(lines).toEqual([
            { label: "Received", value: formatCurrency(350, "ILS"), valueClass: "" },
            { label: "Applied", value: `−${formatCurrency(300, "ILS")}`, valueClass: "text-muted-color" },
        ]);
    });

    it("returns null when there are no links", () => {
        expect(reimbursementReceiptLines(tx({ reimbursement: reimbursement({ links: [] }) }))).toBeNull();
    });

    it("returns null when the transaction has no reimbursement", () => {
        expect(reimbursementReceiptLines(tx({ reimbursement: null }))).toBeNull();
    });

    it("returns null for a transfer", () => {
        expect(
            reimbursementReceiptLines(
                tx({ type: "transfer", transferDirection: "out", reimbursement: reimbursement() }),
            ),
        ).toBeNull();
    });

    it("formats cents exactly", () => {
        const lines = reimbursementReceiptLines(
            tx({ reimbursement: reimbursement({ allocatedTotal: 0.3, allocatedActive: 0.3 }) }),
        );
        expect(lines?.[1]?.value).toBe(`−${formatCurrency(0.3, "ILS")}`);
        expect(lines?.[1]?.value.endsWith("0.30")).toBe(true);
    });

    it("uses the U+2212 minus sign, not a hyphen", () => {
        const lines = reimbursementReceiptLines(tx({ reimbursement: reimbursement({ allocatedActive: 50 }) }));
        expect(lines?.[1]?.value.startsWith("−")).toBe(true);
        expect(lines?.[1]?.value.startsWith("-")).toBe(false);
    });
});
