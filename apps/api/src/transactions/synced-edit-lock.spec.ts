import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { assertSyncedEditAllowed, SyncedLockSnapshot } from "./synced-edit-lock";
import type { UpdateTransactionDto } from "./dto/update-transaction.dto";

const base = (over: Partial<SyncedLockSnapshot> = {}): SyncedLockSnapshot => ({
    externalId: "ext-1",
    type: "expense",
    transferDirection: null,
    amount: new Prisma.Decimal("42.50"),
    currencyId: "cur-1",
    transactionDate: new Date("2025-12-14T00:00:00Z"),
    postedDate: new Date("2025-12-15T00:00:00Z"),
    accountId: "acc-1",
    description: "Coffee",
    originalCategory: "Food",
    ...over,
});

const ok = (cur: SyncedLockSnapshot, dto: Record<string, unknown>) =>
    expect(() => assertSyncedEditAllowed(cur, dto as unknown as UpdateTransactionDto)).not.toThrow();
const bad = (cur: SyncedLockSnapshot, dto: Record<string, unknown>) =>
    expect(() => assertSyncedEditAllowed(cur, dto as unknown as UpdateTransactionDto)).toThrow(BadRequestException);

describe("assertSyncedEditAllowed", () => {
    it.each([null, ""])("accepts anything on a manual row (externalId %p)", (externalId) => {
        ok(base({ externalId }), {
            amount: 1,
            currencyId: "x",
            description: "y",
            type: "income",
            externalId: "z",
            originalCategory: null,
        });
    });

    it.each([
        ["amount", 10],
        ["currencyId", "other"],
        ["transactionDate", "2025-01-01"],
        ["postedDate", "2025-01-01"],
        ["accountId", "other"],
        ["description", "Tea"],
        ["externalId", "ext-2"],
        ["originalCategory", "Other"],
    ])("rejects a changed %s", (field, value) => {
        bad(base(), { [field]: value });
    });

    it("accepts unchanged values", () => {
        ok(base(), { amount: 42.5 });
        ok(base(), { transactionDate: "2025-12-14" });
        ok(base(), { transactionDate: "2025-12-14T00:00:00.000Z" });
        ok(base(), { description: "Coffee", currencyId: "cur-1", accountId: "acc-1", externalId: "ext-1" });
        ok(base(), { originalCategory: "Food", postedDate: "2025-12-15" });
    });

    it("rejects externalId null", () => bad(base(), { externalId: null }));

    it("handles null postedDate", () => {
        ok(base({ postedDate: null }), { postedDate: null });
        bad(base(), { postedDate: null });
    });

    it("rejects originalCategory null on a stored value", () => bad(base(), { originalCategory: null }));

    it("allows user-owned fields", () => {
        ok(base(), { notes: "n", additionalDescription: "a", categoryId: "c", hidden: true, budgetId: "b" });
    });

    describe("type matrix", () => {
        it("synced expense", () => {
            bad(base(), { type: "income" });
            bad(base(), { type: "transfer", transferDirection: "in" });
            ok(base(), { type: "transfer", transferDirection: "out" });
            ok(base(), { type: "transfer" });
        });
        it("synced income", () => {
            const inc = base({ type: "income" });
            bad(inc, { type: "expense" });
            bad(inc, { type: "transfer", transferDirection: "out" });
            ok(inc, { type: "transfer", transferDirection: "in" });
            ok(inc, { type: "transfer" });
        });
        it("synced transfer-out", () => {
            const t = base({ type: "transfer", transferDirection: "out" });
            ok(t, { type: "expense" });
            bad(t, { type: "income" });
            bad(t, { transferDirection: "in" });
        });
        it("synced transfer-in", () => {
            const t = base({ type: "transfer", transferDirection: "in" });
            ok(t, { type: "income" });
            bad(t, { type: "expense" });
            bad(t, { transferDirection: "out" });
        });
        it("treats a null direction as out", () => {
            const t = base({ type: "transfer", transferDirection: null });
            ok(t, { type: "expense" });
            bad(t, { type: "income" });
        });
        it("accepts menu-action payloads", () => {
            ok(base(), { type: "transfer", transferDirection: "out" });
            ok(base({ type: "income" }), { type: "transfer", transferDirection: "in" });
            ok(base({ type: "transfer", transferDirection: "out" }), { type: "expense", hidden: false });
            ok(base({ type: "transfer", transferDirection: "in" }), { type: "income", hidden: false });
        });
    });
});
