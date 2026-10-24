import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
    CounterpartSourceState,
    defaultCounterpartAmount,
    ExistingMirror,
    reconcileCounterpart,
} from "./transfer-counterpart";

describe("transfer-counterpart", () => {
    const source: CounterpartSourceState = {
        id: "src",
        userId: "user",
        accountId: "bank",
        type: "transfer",
        transferDirection: "out",
        amount: 700,
        currencyId: "ils",
        originalAmount: null,
        originalCurrencyId: null,
        description: "ATM",
        transactionDate: new Date("2026-01-05"),
        hidden: false,
    };
    const wallet = { id: "wallet", type: "cash", currencyId: "ils" };
    const existing: ExistingMirror = { id: "mirror", accountId: "wallet", amount: new Prisma.Decimal(700) };

    const tx = {
        transaction: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
        account: { findFirst: jest.fn() },
        currency: { findUnique: jest.fn() },
    };
    const run = (s: CounterpartSourceState, e: ExistingMirror | null, r: Parameters<typeof reconcileCounterpart>[3]) =>
        reconcileCounterpart(tx as unknown as Prisma.TransactionClient, s, e, r);

    beforeEach(() => {
        jest.resetAllMocks();
        tx.account.findFirst.mockResolvedValue(wallet);
    });

    describe("defaultCounterpartAmount", () => {
        it("uses the source amount for the same currency", () => {
            expect(defaultCounterpartAmount(source, "ils")).toBe(700);
        });

        it("uses the original amount when the wallet matches the original currency", () => {
            const fx = { amount: 370, currencyId: "ils", originalAmount: 100, originalCurrencyId: "usd" };
            expect(defaultCounterpartAmount(fx, "usd")).toBe(100);
        });

        it("returns null for any other currency", () => {
            expect(defaultCounterpartAmount(source, "eur")).toBeNull();
        });
    });

    describe("reconcileCounterpart", () => {
        it("creates one mirror for a new counterpart (AC1)", async () => {
            await run(source, null, { counterpartAccountId: "wallet" });

            expect(tx.transaction.create).toHaveBeenCalledTimes(1);
            expect(tx.transaction.create).toHaveBeenCalledWith({
                data: {
                    userId: "user",
                    accountId: "wallet",
                    type: "transfer",
                    transferDirection: "in",
                    amount: 700,
                    currencyId: "ils",
                    description: "ATM",
                    transactionDate: source.transactionDate,
                    hidden: false,
                    categoryId: null,
                    externalId: null,
                    counterpartOfId: "src",
                },
            });
        });

        it("moves the mirror to another wallet", async () => {
            tx.account.findFirst.mockResolvedValue({ id: "usd-wallet", type: "cash", currencyId: "usd" });
            const fx = { ...source, originalAmount: 190, originalCurrencyId: "usd" };

            await run(fx, existing, { counterpartAccountId: "usd-wallet" });

            expect(tx.transaction.update).toHaveBeenCalledWith({
                where: { id: "mirror" },
                data: expect.objectContaining({ accountId: "usd-wallet", currencyId: "usd", amount: 190 }),
            });
            expect(tx.transaction.create).not.toHaveBeenCalled();
        });

        it("deletes the mirror when the counterpart is cleared", async () => {
            await run(source, existing, { counterpartAccountId: null });
            expect(tx.transaction.delete).toHaveBeenCalledWith({ where: { id: "mirror" } });
        });

        it("deletes the mirror when the source stops being a transfer (AC3)", async () => {
            await run({ ...source, type: "expense", transferDirection: null }, existing, {});
            expect(tx.transaction.delete).toHaveBeenCalledWith({ where: { id: "mirror" } });
            expect(tx.account.findFirst).not.toHaveBeenCalled();
        });

        it("does nothing without a mirror and without a request", async () => {
            await run(source, null, {});
            expect(tx.account.findFirst).not.toHaveBeenCalled();
            expect(tx.transaction.create).not.toHaveBeenCalled();
            expect(tx.transaction.delete).not.toHaveBeenCalled();
        });

        it("syncs the mirror on a date or hidden change, keeping its amount (AC5)", async () => {
            const changed = { ...source, transactionDate: new Date("2026-02-01"), hidden: true };
            const custom = { ...existing, amount: 650 };

            await run(changed, custom, {});

            expect(tx.transaction.update).toHaveBeenCalledWith({
                where: { id: "mirror" },
                data: expect.objectContaining({
                    transactionDate: changed.transactionDate,
                    hidden: true,
                    amount: 650,
                    accountId: "wallet",
                }),
            });
        });

        it("flips the mirror direction when the source direction flips", async () => {
            await run({ ...source, transferDirection: "in" }, existing, {});
            expect(tx.transaction.update.mock.calls[0][0].data.transferDirection).toBe("out");
        });

        it("uses an explicit counterpartAmount", async () => {
            await run(source, existing, { counterpartAmount: 120 });
            expect(tx.transaction.update.mock.calls[0][0].data.amount).toBe(120);
        });

        it("rejects when only the source account moves onto the existing counterpart's account", async () => {
            await expect(run({ ...source, accountId: "wallet" }, existing, {})).rejects.toThrow(
                "The counterpart must be a different account",
            );
            expect(tx.transaction.update).not.toHaveBeenCalled();
        });

        it("rejects a stray counterpartAmount on a non-transfer or counterpart-less row", async () => {
            await expect(
                run({ ...source, type: "expense", transferDirection: null }, null, { counterpartAmount: 5 }),
            ).rejects.toThrow(BadRequestException);
            await expect(run(source, null, { counterpartAmount: 5 })).rejects.toThrow(BadRequestException);
        });

        it("rejects an unknown account", async () => {
            tx.account.findFirst.mockResolvedValue(null);
            await expect(run(source, null, { counterpartAccountId: "nope" })).rejects.toThrow(
                "Counterpart account not found",
            );
        });

        it("rejects a bank account", async () => {
            tx.account.findFirst.mockResolvedValue({ ...wallet, type: "bank" });
            await expect(run(source, null, { counterpartAccountId: "wallet" })).rejects.toThrow(
                "The counterpart must be one of your cash or savings accounts",
            );
        });

        it("rejects a credit card account", async () => {
            tx.account.findFirst.mockResolvedValue({ ...wallet, type: "credit_card" });
            await expect(run(source, null, { counterpartAccountId: "wallet" })).rejects.toThrow(BadRequestException);
            expect(tx.transaction.create).not.toHaveBeenCalled();
        });

        it("accepts a savings counterpart for an out transfer, mirrored as in", async () => {
            tx.account.findFirst.mockResolvedValue({ ...wallet, type: "savings" });

            await run(source, null, { counterpartAccountId: "wallet" });

            expect(tx.transaction.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    accountId: "wallet",
                    transferDirection: "in",
                    amount: 700,
                    counterpartOfId: "src",
                }),
            });
        });

        it("accepts a savings counterpart for an in transfer, mirrored as out", async () => {
            tx.account.findFirst.mockResolvedValue({ ...wallet, type: "savings" });

            await run({ ...source, transferDirection: "in" }, null, { counterpartAccountId: "wallet" });

            expect(tx.transaction.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    accountId: "wallet",
                    transferDirection: "out",
                    counterpartOfId: "src",
                }),
            });
        });

        it("rejects the same account as the source (AC12)", async () => {
            tx.account.findFirst.mockResolvedValue({ ...wallet, id: "bank" });
            await expect(run(source, null, { counterpartAccountId: "bank" })).rejects.toThrow(
                "The counterpart must be a different account",
            );
        });

        it("rejects a wallet without a currency", async () => {
            tx.account.findFirst.mockResolvedValue({ ...wallet, currencyId: null });
            await expect(run(source, null, { counterpartAccountId: "wallet" })).rejects.toThrow(
                "Set a currency on this account first",
            );
        });

        it("asks for the amount when no default exists", async () => {
            tx.account.findFirst.mockResolvedValue({ ...wallet, currencyId: "eur" });
            tx.currency.findUnique.mockResolvedValue({ code: "EUR" });
            await expect(run(source, null, { counterpartAccountId: "wallet" })).rejects.toThrow(
                "Enter the amount received in EUR",
            );
            expect(tx.transaction.create).not.toHaveBeenCalled();
        });

        it("rejects a counterpart on a non-transfer", async () => {
            const err = run({ ...source, type: "expense" }, null, { counterpartAccountId: "wallet" });
            await expect(err).rejects.toThrow(BadRequestException);
            await expect(err).rejects.toThrow("Only transfers can have a counterpart account");
        });
    });
});
