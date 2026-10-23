import { BadRequestException } from "@nestjs/common";
import { assertReimbursementEditAllowed, ReimbursementGuardSnapshot } from "./reimbursement-edit-guard";

const expense = (overrides: Partial<ReimbursementGuardSnapshot> = {}): ReimbursementGuardSnapshot => ({
    type: "expense",
    amount: 100,
    currencyId: "usd",
    allocatedAsExpense: 40,
    allocatedAsIncome: 0,
    ...overrides,
});

const income = (overrides: Partial<ReimbursementGuardSnapshot> = {}): ReimbursementGuardSnapshot => ({
    type: "income",
    amount: 80,
    currencyId: "usd",
    allocatedAsExpense: 0,
    allocatedAsIncome: 30,
    ...overrides,
});

describe("assertReimbursementEditAllowed", () => {
    describe("amount", () => {
        it("rejects shrinking a linked expense below its allocated total", () => {
            expect(() => assertReimbursementEditAllowed(expense(), { amount: 39.99 })).toThrow(BadRequestException);
            expect(() => assertReimbursementEditAllowed(expense(), { amount: 39.99 })).toThrow(
                "This transaction is linked to reimbursements (40 allocated). Unlink or reduce the reimbursement first.",
            );
        });

        it("rejects shrinking a linked income below its allocated total", () => {
            expect(() => assertReimbursementEditAllowed(income(), { amount: 10 })).toThrow(BadRequestException);
        });

        it("allows an amount equal to the allocated total", () => {
            expect(() => assertReimbursementEditAllowed(expense(), { amount: 40 })).not.toThrow();
        });

        it("compares in cents so float noise does not reject an equal amount", () => {
            const current = expense({ allocatedAsExpense: 0.3 });
            expect(() => assertReimbursementEditAllowed(current, { amount: 0.3 })).not.toThrow();
        });

        it("allows growing a linked row", () => {
            expect(() => assertReimbursementEditAllowed(expense(), { amount: 500 })).not.toThrow();
        });
    });

    describe("currency", () => {
        it("rejects changing currency on a linked row", () => {
            expect(() => assertReimbursementEditAllowed(expense(), { currencyId: "ils" })).toThrow(
                "Can't change currency while linked to reimbursements. Unlink or reduce the reimbursement first.",
            );
        });

        it("allows sending the same currency", () => {
            expect(() => assertReimbursementEditAllowed(income(), { currencyId: "usd" })).not.toThrow();
        });
    });

    describe("type", () => {
        it("rejects changing type on a linked row", () => {
            expect(() => assertReimbursementEditAllowed(expense(), { type: "transfer" })).toThrow(
                "Can't change type while linked to reimbursements. Unlink or reduce the reimbursement first.",
            );
        });

        it("allows re-sending the same type", () => {
            expect(() => assertReimbursementEditAllowed(expense(), { type: "expense" })).not.toThrow();
        });
    });

    describe("unlinked and other rows", () => {
        it("does not guard a row with no allocations", () => {
            const unlinked = expense({ allocatedAsExpense: 0 });
            expect(() =>
                assertReimbursementEditAllowed(unlinked, { amount: 1, currencyId: "ils", type: "income" }),
            ).not.toThrow();
        });

        it("guards by role: an expense's income-side allocations do not block it", () => {
            const role = expense({ allocatedAsExpense: 0, allocatedAsIncome: 50 });
            expect(() => assertReimbursementEditAllowed(role, { amount: 1 })).not.toThrow();
        });

        it("never guards transfers", () => {
            const transfer = { ...expense(), type: "transfer", allocatedAsExpense: 40, allocatedAsIncome: 40 };
            expect(() => assertReimbursementEditAllowed(transfer, { amount: 1, type: "expense" })).not.toThrow();
        });
    });

    describe("hidden-only edits", () => {
        it("allows a hidden-only edit on a linked row", () => {
            // The guard takes no `hidden` field, so a hidden-only DTO has nothing to reject.
            expect(() => assertReimbursementEditAllowed(expense(), {})).not.toThrow();
        });
    });
});
