import { Prisma } from "@prisma/client";
import { netOf, sumAllocations, toCents, toReimbursementSummary } from "./reimbursement-netting";

type Row = Parameters<typeof toReimbursementSummary>[0];
type Side = NonNullable<NonNullable<Row["reimbursedBy"]>[number]["income"]>;

const day = new Date("2026-01-05");

const side = (id: string, overrides: Partial<Side> = {}): Side => ({
    id,
    description: `side ${id}`,
    amount: 100,
    transactionDate: day,
    hidden: false,
    deletedAt: null,
    reimburses: [],
    reimbursedBy: [],
    ...overrides,
});

describe("reimbursement-netting", () => {
    describe("cents math", () => {
        it("sums 0.1 + 0.2 to exactly 0.3", () => {
            expect(sumAllocations([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
        });

        it("rounds to cents through Number() for Decimal values", () => {
            expect(toCents(new Prisma.Decimal("12.34"))).toBe(1234);
            expect(sumAllocations([{ amount: new Prisma.Decimal("12.34") }, { amount: "0.66" }])).toBe(13);
        });

        it("netOf subtracts exactly and clamps at 0", () => {
            expect(netOf(new Prisma.Decimal("100.10"), 30.05)).toBe(70.05);
            expect(netOf(10, 15)).toBe(0);
            expect(netOf(0.3, 0.1 + 0.2)).toBe(0);
        });
    });

    describe("toReimbursementSummary", () => {
        it("returns null for transfers even when links exist", () => {
            const row: Row = {
                type: "transfer",
                hidden: false,
                deletedAt: null,
                reimbursedBy: [{ id: "a1", amount: 10, income: side("inc") }],
            };
            expect(toReimbursementSummary(row)).toBeNull();
        });

        it("returns null when there are no links", () => {
            expect(
                toReimbursementSummary({ type: "expense", hidden: false, deletedAt: null, reimbursedBy: [] }),
            ).toBeNull();
            expect(toReimbursementSummary({ type: "income", hidden: false, deletedAt: null })).toBeNull();
        });

        it("skips links whose other side is deleted", () => {
            const row: Row = {
                type: "expense",
                hidden: false,
                deletedAt: null,
                reimbursedBy: [{ id: "a1", amount: 10, income: side("gone", { deletedAt: day }) }],
            };
            expect(toReimbursementSummary(row)).toBeNull();
        });

        it("expense with two incomes: a hidden income is kept in the total but not in the active sum", () => {
            const incA = side("incA", { amount: 50, reimburses: [{ amount: 30 }] });
            const incB = side("incB", { amount: 40, hidden: true, reimburses: [{ amount: 20 }] });
            const expense: Row = {
                type: "expense",
                hidden: false,
                deletedAt: null,
                reimbursedBy: [
                    { id: "a1", amount: 30, income: incA },
                    { id: "a2", amount: 20, income: incB },
                ],
            };

            const summary = toReimbursementSummary(expense);

            expect(summary).toEqual({
                role: "expense",
                allocatedTotal: 50,
                allocatedActive: 30,
                links: [
                    {
                        allocationId: "a1",
                        transactionId: "incA",
                        description: "side incA",
                        transactionAmount: 50,
                        transactionRemaining: 20,
                        transactionDate: day,
                        amount: 30,
                        active: true,
                    },
                    {
                        allocationId: "a2",
                        transactionId: "incB",
                        description: "side incB",
                        transactionAmount: 40,
                        transactionRemaining: 20,
                        transactionDate: day,
                        amount: 20,
                        active: false,
                    },
                ],
            });
        });

        it("income split across two expenses reports each expense's remaining from its own allocations", () => {
            const expOne = side("expOne", { amount: 50, reimbursedBy: [{ amount: 30 }] });
            const expTwo = side("expTwo", { amount: 40, reimbursedBy: [{ amount: 60 }] });
            const income: Row = {
                type: "income",
                hidden: false,
                deletedAt: null,
                reimburses: [
                    { id: "a1", amount: 30, expense: expOne },
                    { id: "a2", amount: 60, expense: expTwo },
                ],
            };

            const summary = toReimbursementSummary(income);

            expect(summary?.role).toBe("income");
            expect(summary?.allocatedTotal).toBe(90);
            expect(summary?.allocatedActive).toBe(90);
            expect(summary?.links[0].transactionRemaining).toBe(20);
            // Over-allocated expense (60 against 40) clamps at zero.
            expect(summary?.links[1].transactionRemaining).toBe(0);
        });

        it("a hidden row keeps allocatedTotal but reports allocatedActive 0 and inactive links", () => {
            const row: Row = {
                type: "expense",
                hidden: true,
                deletedAt: null,
                reimbursedBy: [{ id: "a1", amount: 30, income: side("inc") }],
            };

            const summary = toReimbursementSummary(row);

            expect(summary?.allocatedTotal).toBe(30);
            expect(summary?.allocatedActive).toBe(0);
            expect(summary?.links[0].active).toBe(false);
        });

        it("sums link amounts in cents", () => {
            const row: Row = {
                type: "expense",
                hidden: false,
                deletedAt: null,
                reimbursedBy: [
                    { id: "a1", amount: 0.1, income: side("incA") },
                    { id: "a2", amount: 0.2, income: side("incB") },
                ],
            };

            expect(toReimbursementSummary(row)?.allocatedTotal).toBe(0.3);
        });
    });
});
