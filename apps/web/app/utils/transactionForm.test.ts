import { describe, expect, it } from "vitest";
import type { IAccountResponse, ITransactionResponse } from "@badger/types";
import { TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH, TRANSACTION_NOTES_MAX_LENGTH } from "@badger/shared-data";
import {
    buildCreateTransactionPayload,
    counterpartLabel,
    counterpartOptions,
    currencyForAccountChange,
    shouldKeepInitialCounterpartAmount,
    defaultCounterpartAmount,
    isCurrencyLockedByAccount,
    MIRROR_TOOLTIP,
    neededCounterpartCurrencyId,
    currencyDisplayLabel,
    createInitialFormValues,
    cashFollowupFor,
    resolveDefaultCurrencyId,
    validateTransactionForm,
    bankDirection,
    applyUpdateToTransaction,
    buildUpdateTransactionPayload,
    directionForTypeChange,
    editConstraintsFor,
    isEditDirty,
    isSyncedTransaction,
    isTypeAllowed,
    parseDateOnly,
    transactionToFormValues,
    validateTransactionEdit,
    type TransactionFormValues,
} from "./transactionForm";

const ILS = { id: "cur-ils", code: "ILS" };
const USD = { id: "cur-usd", code: "USD" };
const EUR = { id: "cur-eur", code: "EUR" };

const account = (id: string, currencyId: string | null = null) => ({ id, currencyId }) as IAccountResponse;

const validValues = (over: Partial<TransactionFormValues> = {}): TransactionFormValues => ({
    type: "expense",
    amount: 12.5,
    description: "Coffee",
    accountId: "acc-1",
    date: new Date(2026, 9, 9),
    categoryId: null,
    currencyId: "cur-ils",
    additionalDescription: "",
    notes: "",
    hidden: false,
    transferDirection: "out",
    counterpartAccountId: null,
    counterpartAmount: null,
    ...over,
});

describe("resolveDefaultCurrencyId", () => {
    it("uses the account currency", () => {
        expect(resolveDefaultCurrencyId({ currencyId: USD.id }, [ILS, USD], "EUR")).toBe(USD.id);
    });

    it("falls back to the locale code when the account has no currency", () => {
        expect(resolveDefaultCurrencyId({ currencyId: null }, [ILS, USD, EUR], "EUR")).toBe(EUR.id);
        expect(resolveDefaultCurrencyId(null, [ILS, USD, EUR], "USD")).toBe(USD.id);
    });

    it("falls back to ILS when the locale code is unknown", () => {
        expect(resolveDefaultCurrencyId(undefined, [USD, ILS], "XXX")).toBe(ILS.id);
    });

    it("falls back to the first currency when there is no ILS", () => {
        expect(resolveDefaultCurrencyId(undefined, [USD, EUR], "XXX")).toBe(USD.id);
    });

    it("returns null with no currencies", () => {
        expect(resolveDefaultCurrencyId({ currencyId: "x" }, [], "ILS")).toBeNull();
    });

    it("ignores an account currency that is not in the list", () => {
        expect(resolveDefaultCurrencyId({ currencyId: "gone" }, [ILS, USD], "USD")).toBe(USD.id);
    });
});

describe("resolveDefaultCurrencyId with all accounts", () => {
    it("uses the most common account currency when no account is selected", () => {
        const accounts = [account("a1", ILS.id), account("a2", ILS.id), account("a3", USD.id)];
        expect(resolveDefaultCurrencyId(null, [USD, ILS], "USD", accounts)).toBe(ILS.id);
    });

    it("prefers the selected account over the most common currency", () => {
        const accounts = [account("a1", ILS.id), account("a2", ILS.id), account("a3", USD.id)];
        expect(resolveDefaultCurrencyId(accounts[2], [USD, ILS], "EUR", accounts)).toBe(USD.id);
    });

    it("ignores account currencies missing from the list and falls back to locale", () => {
        expect(resolveDefaultCurrencyId(null, [USD, EUR], "EUR", [account("a1", "gone")])).toBe(EUR.id);
    });
});

describe("currencyDisplayLabel", () => {
    const cur = (id: string, code: string, symbol: string) => ({ id, code, symbol });
    const list = [cur("1", "ILS", "₪"), cur("2", "USD", "$"), cur("3", "CAD", "$")];

    it("shows only the symbol when unambiguous", () => {
        expect(currencyDisplayLabel(list[0]!, list)).toBe("₪");
    });

    it("adds the code when another currency shares the symbol", () => {
        expect(currencyDisplayLabel(list[1]!, list)).toBe("$ USD");
        expect(currencyDisplayLabel(list[2]!, list)).toBe("$ CAD");
    });
});

describe("createInitialFormValues", () => {
    it("preselects the only account and its currency", () => {
        const v = createInitialFormValues([account("a1", USD.id)], [ILS, USD], { localeCurrencyCode: "ILS" });
        expect(v.accountId).toBe("a1");
        expect(v.currencyId).toBe(USD.id);
    });

    it("leaves the account empty with several accounts and uses the locale fallback", () => {
        const v = createInitialFormValues([account("a1", USD.id), account("a2")], [ILS, EUR], {
            localeCurrencyCode: "EUR",
        });
        expect(v.accountId).toBeNull();
        expect(v.currencyId).toBe(EUR.id);
    });

    it("defaults to the most common account currency with several accounts", () => {
        const v = createInitialFormValues([account("a1", ILS.id), account("a2", ILS.id)], [USD, ILS], {
            localeCurrencyCode: "USD",
        });
        expect(v.currencyId).toBe(ILS.id);
    });

    it("uses opts.now as the date and sets the defaults", () => {
        const now = new Date(2026, 9, 9, 12);
        const v = createInitialFormValues([], [ILS], { now });
        expect(v.date).toBe(now);
        expect(v).toMatchObject({
            type: "expense",
            amount: null,
            description: "",
            categoryId: null,
            additionalDescription: "",
            notes: "",
            hidden: false,
            transferDirection: "out",
            currencyId: ILS.id,
        });
    });
});

describe("validateTransactionForm", () => {
    it("accepts a valid form", () => {
        expect(validateTransactionForm(validValues())).toEqual({});
    });

    it("requires an amount", () => {
        expect(validateTransactionForm(validValues({ amount: null })).amount).toBe("Enter an amount");
        expect(validateTransactionForm(validValues({ amount: NaN })).amount).toBe("Enter an amount");
    });

    it("requires a positive amount", () => {
        expect(validateTransactionForm(validValues({ amount: 0 })).amount).toBe("Amount must be greater than 0");
        expect(validateTransactionForm(validValues({ amount: -1 })).amount).toBe("Amount must be greater than 0");
    });

    it("requires a non-blank description", () => {
        expect(validateTransactionForm(validValues({ description: "" })).description).toBe("Enter a description");
        expect(validateTransactionForm(validValues({ description: "   " })).description).toBe("Enter a description");
    });

    it("requires account, date and currency", () => {
        const errors = validateTransactionForm(validValues({ accountId: null, date: null, currencyId: null }));
        expect(errors.accountId).toBe("Choose an account");
        expect(errors.date).toBe("Pick a date");
        expect(errors.currencyId).toBe("Choose a currency");
    });

    it("enforces the additional description limit at the boundary", () => {
        const max = TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH;
        expect(validateTransactionForm(validValues({ additionalDescription: "a".repeat(max) }))).toEqual({});
        expect(
            validateTransactionForm(validValues({ additionalDescription: "a".repeat(max + 1) })).additionalDescription,
        ).toBe(`Must be at most ${max} characters`);
    });

    it("enforces the notes limit at the boundary", () => {
        const max = TRANSACTION_NOTES_MAX_LENGTH;
        expect(validateTransactionForm(validValues({ notes: "a".repeat(max) }))).toEqual({});
        expect(validateTransactionForm(validValues({ notes: "a".repeat(max + 1) })).notes).toBe(
            `Must be at most ${max} characters`,
        );
    });
});

describe("buildCreateTransactionPayload", () => {
    it("builds a minimal expense with exactly the required keys", () => {
        const payload = buildCreateTransactionPayload(validValues());
        expect(Object.keys(payload).sort()).toEqual(
            ["accountId", "type", "amount", "currencyId", "description", "transactionDate", "hidden"].sort(),
        );
        expect(payload).toMatchObject({ amount: 12.5, transactionDate: "2026-10-09", hidden: false });
    });

    it("includes transferDirection for transfers", () => {
        const payload = buildCreateTransactionPayload(validValues({ type: "transfer", transferDirection: "in" }));
        expect(payload.transferDirection).toBe("in");
    });

    it("never includes transferDirection for income or expense", () => {
        for (const type of ["income", "expense"] as const) {
            const payload = buildCreateTransactionPayload(validValues({ type, transferDirection: "in" }));
            expect("transferDirection" in payload).toBe(false);
        }
    });

    it("omits empty or whitespace-only notes and additional description", () => {
        const payload = buildCreateTransactionPayload(validValues({ notes: "  ", additionalDescription: "" }));
        expect("notes" in payload).toBe(false);
        expect("additionalDescription" in payload).toBe(false);
    });

    it("trims text values and includes the category when set", () => {
        const payload = buildCreateTransactionPayload(
            validValues({
                description: "  Coffee  ",
                notes: " note ",
                additionalDescription: " more ",
                categoryId: "cat-1",
                hidden: true,
            }),
        );
        expect(payload).toMatchObject({
            description: "Coffee",
            notes: "note",
            additionalDescription: "more",
            categoryId: "cat-1",
            hidden: true,
        });
    });

    it("throws when required fields are missing", () => {
        expect(() => buildCreateTransactionPayload(validValues({ amount: null }))).toThrow();
        expect(() => buildCreateTransactionPayload(validValues({ date: null }))).toThrow();
    });
});

const txFixture = (over: Partial<ITransactionResponse> = {}) =>
    ({
        id: "tx-1",
        type: "expense",
        amount: "42.50" as unknown as number,
        currencyId: "cur-ils",
        accountId: "acc-1",
        description: "Bank coffee",
        transactionDate: "2026-10-09T00:00:00.000Z" as unknown as Date,
        additionalDescription: null,
        notes: null,
        categoryId: null,
        hidden: false,
        transferDirection: null,
        externalId: null,
        ...over,
    }) as ITransactionResponse;

const synced = (over: Partial<ITransactionResponse> = {}) => txFixture({ externalId: "ext-1", ...over });

describe("parseDateOnly", () => {
    it("reads the UTC calendar day as local midnight", () => {
        const d = parseDateOnly("2026-10-09T00:00:00.000Z");
        expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 9, 0]);
    });

    it("accepts a Date", () => {
        expect(parseDateOnly(new Date("2026-10-09T00:00:00.000Z")).getDate()).toBe(9);
    });
});

describe("transactionToFormValues", () => {
    it("prefills from a synced row", () => {
        const v = transactionToFormValues(synced({ type: "income", notes: "n", categoryId: "cat-1" }));
        expect(v).toMatchObject({
            type: "income",
            amount: 42.5,
            description: "Bank coffee",
            accountId: "acc-1",
            currencyId: "cur-ils",
            additionalDescription: "",
            notes: "n",
            categoryId: "cat-1",
            transferDirection: "in",
        });
        expect(v.date?.getDate()).toBe(9);
    });

    it("prefills from a manual transfer", () => {
        const v = transactionToFormValues(txFixture({ type: "transfer", transferDirection: "in", hidden: true }));
        expect(v).toMatchObject({ type: "transfer", transferDirection: "in", hidden: true, notes: "" });
    });
});

describe("edit constraints", () => {
    const types = ["income", "expense", "transfer"] as const;

    it("detects synced rows", () => {
        expect(isSyncedTransaction({ externalId: "x" })).toBe(true);
        expect(isSyncedTransaction({ externalId: null })).toBe(false);
        expect(isSyncedTransaction({})).toBe(false);
    });

    it("computes bank direction", () => {
        expect(bankDirection({ type: "income" })).toBe("in");
        expect(bankDirection({ type: "expense" })).toBe("out");
        expect(bankDirection({ type: "transfer", transferDirection: "in" })).toBe("in");
        expect(bankDirection({ type: "transfer", transferDirection: null })).toBe("out");
    });

    it("locks all bank fields on synced rows only", () => {
        const s = editConstraintsFor(synced({ type: "income" }));
        expect(s.synced).toBe(true);
        expect(s.bankDirection).toBe("in");
        expect([...s.locked].sort()).toEqual(
            ["accountId", "amount", "currencyId", "date", "description", "transferDirection"].sort(),
        );
        expect(editConstraintsFor(txFixture())).toEqual({
            synced: false,
            mirror: false,
            source: null,
            locked: new Set(),
            bankDirection: null,
        });
    });

    it("isTypeAllowed matrix", () => {
        const manual = editConstraintsFor(txFixture());
        const out = editConstraintsFor(synced({ type: "expense" }));
        const inn = editConstraintsFor(synced({ type: "income" }));
        expect(types.map((t) => isTypeAllowed(t, manual))).toEqual([true, true, true]);
        expect(types.map((t) => isTypeAllowed(t, out))).toEqual([false, true, true]);
        expect(types.map((t) => isTypeAllowed(t, inn))).toEqual([true, false, true]);
        const trIn = editConstraintsFor(synced({ type: "transfer", transferDirection: "in" }));
        const trOut = editConstraintsFor(synced({ type: "transfer", transferDirection: "out" }));
        expect(types.map((t) => isTypeAllowed(t, trIn))).toEqual([true, false, true]);
        expect(types.map((t) => isTypeAllowed(t, trOut))).toEqual([false, true, true]);
    });

    it("directionForTypeChange", () => {
        const inn = editConstraintsFor(synced({ type: "income" }));
        expect(directionForTypeChange("transfer", { type: "income", transferDirection: "out" }, inn)).toBe("in");
        const manual = editConstraintsFor(txFixture());
        expect(directionForTypeChange("transfer", { type: "income", transferDirection: "out" }, manual)).toBe("in");
        expect(directionForTypeChange("transfer", { type: "expense", transferDirection: "in" }, manual)).toBe("out");
        expect(directionForTypeChange("expense", { type: "transfer", transferDirection: "in" }, manual)).toBe("in");
    });
});

describe("buildUpdateTransactionPayload / isEditDirty", () => {
    const manualC = editConstraintsFor(txFixture());
    const syncedC = editConstraintsFor(synced());
    const base = transactionToFormValues(txFixture());

    it("is empty with no change", () => {
        expect(buildUpdateTransactionPayload(base, { ...base }, manualC)).toEqual({});
        expect(isEditDirty(base, { ...base }, manualC)).toBe(false);
    });

    it("clears notes to null", () => {
        const init = { ...base, notes: "hello" };
        expect(buildUpdateTransactionPayload(init, { ...init, notes: "" }, manualC)).toEqual({ notes: null });
    });

    it("ignores whitespace-only changes", () => {
        const init = { ...base, notes: "hello" };
        expect(buildUpdateTransactionPayload(init, { ...init, notes: "  hello " }, manualC)).toEqual({});
        expect(buildUpdateTransactionPayload(base, { ...base, notes: "   " }, manualC)).toEqual({});
    });

    it("compares amounts in cents", () => {
        expect(buildUpdateTransactionPayload(base, { ...base, amount: 42.5 }, manualC)).toEqual({});
        expect(buildUpdateTransactionPayload(base, { ...base, amount: 43 }, manualC)).toEqual({ amount: 43 });
    });

    it("emits a local ISO date", () => {
        expect(buildUpdateTransactionPayload(base, { ...base, date: new Date(2026, 9, 10) }, manualC)).toEqual({
            transactionDate: "2026-10-10",
        });
    });

    it("emits direction on a type change to transfer only", () => {
        expect(
            buildUpdateTransactionPayload(base, { ...base, type: "transfer", transferDirection: "in" }, manualC),
        ).toEqual({ type: "transfer", transferDirection: "in" });
        expect(
            buildUpdateTransactionPayload({ ...base, type: "transfer" }, { ...base, type: "expense" }, manualC),
        ).toEqual({ type: "expense" });
    });

    it("synced type change to transfer takes direction from the bank, not the form", () => {
        const exp = editConstraintsFor(synced({ type: "expense" }));
        const inc = editConstraintsFor(synced({ type: "income" }));
        expect(
            buildUpdateTransactionPayload(
                { ...base, type: "expense" },
                { ...base, type: "transfer", transferDirection: "in" },
                exp,
            ),
        ).toEqual({ type: "transfer", transferDirection: "out" });
        expect(
            buildUpdateTransactionPayload(
                { ...base, type: "income" },
                { ...base, type: "transfer", transferDirection: "out" },
                inc,
            ),
        ).toEqual({ type: "transfer", transferDirection: "in" });
        const tr = editConstraintsFor(synced({ type: "transfer", transferDirection: "out" }));
        expect(
            buildUpdateTransactionPayload(
                { ...base, type: "transfer", transferDirection: "out" },
                { ...base, type: "expense", transferDirection: "out" },
                tr,
            ),
        ).toEqual({ type: "expense" });
    });

    it("emits direction changes on same-type transfers", () => {
        const init = { ...base, type: "transfer" as const, transferDirection: "out" as const };
        expect(buildUpdateTransactionPayload(init, { ...init, transferDirection: "in" }, manualC)).toEqual({
            transferDirection: "in",
        });
    });

    it("never emits locked fields on synced rows", () => {
        const current = {
            ...base,
            amount: 1,
            currencyId: "cur-usd",
            date: new Date(2026, 0, 1),
            accountId: "acc-2",
            description: "x",
            notes: "mine",
        };
        expect(buildUpdateTransactionPayload(base, current, syncedC)).toEqual({ notes: "mine" });
    });

    it("clears category to null and toggles hidden", () => {
        const init = { ...base, categoryId: "cat-1" };
        expect(buildUpdateTransactionPayload(init, { ...init, categoryId: null }, manualC)).toEqual({
            categoryId: null,
        });
        expect(buildUpdateTransactionPayload(base, { ...base, hidden: true }, manualC)).toEqual({ hidden: true });
    });

    it("is dirty only for editable changes", () => {
        expect(isEditDirty(base, { ...base, notes: "x" }, manualC)).toBe(true);
        expect(isEditDirty(base, { ...base, amount: 1 }, syncedC)).toBe(false);
    });
});

describe("validateTransactionEdit", () => {
    const syncedC = editConstraintsFor(synced());
    const manualC = editConstraintsFor(txFixture());
    const tooLong = "n".repeat(TRANSACTION_NOTES_MAX_LENGTH + 1);

    it("ignores unchanged invalid fields", () => {
        const legacy = { ...transactionToFormValues(synced()), amount: 0, notes: tooLong };
        expect(validateTransactionEdit(legacy, { ...legacy }, syncedC)).toEqual({});
    });

    it("reports changed invalid fields", () => {
        const init = transactionToFormValues(txFixture());
        const errors = validateTransactionEdit(init, { ...init, notes: tooLong, amount: 0 }, manualC);
        expect(Object.keys(errors).sort()).toEqual(["amount", "notes"]);
    });

    it("ignores locked fields even when changed and invalid", () => {
        const init = transactionToFormValues(synced());
        expect(validateTransactionEdit(init, { ...init, amount: 0, description: "" }, syncedC)).toEqual({});
    });
});

describe("applyUpdateToTransaction", () => {
    const tx = {
        id: "t1",
        description: "Coffee",
        amount: 12,
        accountId: "a1",
        categoryId: "c1",
        notes: "old",
    } as unknown as ITransactionResponse;

    it("sets a new categoryId", () => {
        expect(applyUpdateToTransaction(tx, { categoryId: "c2" }).categoryId).toBe("c2");
    });

    it("clears categoryId to null", () => {
        expect(applyUpdateToTransaction(tx, { categoryId: null }).categoryId).toBeNull();
    });

    it("applies changed notes", () => {
        expect(applyUpdateToTransaction(tx, { notes: "new" }).notes).toBe("new");
    });

    it("keeps untouched fields", () => {
        const out = applyUpdateToTransaction(tx, { notes: "new" });
        expect(out.description).toBe("Coffee");
        expect(out.amount).toBe(12);
        expect(out.accountId).toBe("a1");
    });

    it("does not mutate the input", () => {
        applyUpdateToTransaction(tx, { categoryId: "c2", notes: "new" });
        expect(tx.categoryId).toBe("c1");
        expect(tx.notes).toBe("old");
    });
});

describe("defaultCounterpartAmount", () => {
    it("uses the source amount in the same currency", () => {
        expect(defaultCounterpartAmount({ amount: 50, currencyId: "cur-ils" }, "cur-ils")).toBe(50);
    });

    it("uses the original amount when the wallet matches the original currency", () => {
        const src = { amount: 370, currencyId: "cur-ils", originalAmount: 100, originalCurrencyId: "cur-usd" };
        expect(defaultCounterpartAmount(src, "cur-usd")).toBe(100);
    });

    it("is null otherwise", () => {
        expect(defaultCounterpartAmount({ amount: 50, currencyId: "cur-ils" }, "cur-eur")).toBeNull();
        expect(defaultCounterpartAmount({ amount: 50, currencyId: "cur-ils" }, null)).toBeNull();
    });
});

describe("counterpart helpers", () => {
    const acc = (id: string, type: IAccountResponse["type"]) => ({ id, type }) as IAccountResponse;

    it("counterpartOptions keeps only cash accounts other than the source", () => {
        const list = [acc("a", "bank"), acc("b", "cash"), acc("c", "cash"), acc("d", "credit_card")];
        expect(counterpartOptions(list, "b").map((a) => a.id)).toEqual(["c"]);
        expect(counterpartOptions(list, null).map((a) => a.id)).toEqual(["b", "c"]);
    });

    it("neededCounterpartCurrencyId prefers the original currency", () => {
        const v = validValues();
        expect(neededCounterpartCurrencyId(v)).toBe("cur-ils");
        expect(neededCounterpartCurrencyId(v, { originalCurrencyId: null })).toBe("cur-ils");
        expect(neededCounterpartCurrencyId(v, { originalCurrencyId: "cur-usd" })).toBe("cur-usd");
    });

    it("counterpartLabel", () => {
        expect(counterpartLabel("out")).toBe("To account");
        expect(counterpartLabel("in")).toBe("From account");
    });

    it("isCurrencyLockedByAccount", () => {
        expect(isCurrencyLockedByAccount({ type: "cash", currencyId: "cur-ils" })).toBe(true);
        expect(isCurrencyLockedByAccount({ type: "cash", currencyId: null })).toBe(false);
        expect(isCurrencyLockedByAccount({ type: "bank", currencyId: "cur-ils" })).toBe(false);
        expect(isCurrencyLockedByAccount(null)).toBe(false);
    });

    it("currencyForAccountChange: edit onto a cash wallet adopts its currency unless the field is locked", () => {
        const cash = { type: "cash" as const, currencyId: "cur-usd" };
        expect(currencyForAccountChange(cash, { isEdit: true, currencyLocked: false })).toBe("cur-usd");
        expect(currencyForAccountChange(cash, { isEdit: false, currencyLocked: false })).toBe("cur-usd");
        expect(currencyForAccountChange(cash, { isEdit: true, currencyLocked: true })).toBeNull();
        expect(
            currencyForAccountChange({ type: "bank", currencyId: "cur-usd" }, { isEdit: true, currencyLocked: false }),
        ).toBeNull();
    });

    it("shouldKeepInitialCounterpartAmount only while amount and currency are unchanged", () => {
        const initial = validValues({ amount: 700, counterpartAccountId: "w", counterpartAmount: 700 });
        expect(shouldKeepInitialCounterpartAmount(initial, { amount: 700, currencyId: "cur-ils" }, "w")).toBe(true);
        expect(shouldKeepInitialCounterpartAmount(initial, { amount: 800, currencyId: "cur-ils" }, "w")).toBe(false);
        expect(shouldKeepInitialCounterpartAmount(initial, { amount: 700, currencyId: "cur-usd" }, "w")).toBe(false);
        expect(shouldKeepInitialCounterpartAmount(initial, { amount: 700, currencyId: "cur-ils" }, "x")).toBe(false);
    });

    it("MIRROR_TOOLTIP names the source", () => {
        expect(MIRROR_TOOLTIP({ id: "s", description: "ATM", accountId: "a", accountName: "Bank" })).toBe(
            "Follows the transfer “ATM” on Bank. Edit that one instead.",
        );
        expect(MIRROR_TOOLTIP(null)).toBe("Follows a linked transfer");
    });
});

describe("counterpart form logic", () => {
    const transfer = (over: Partial<TransactionFormValues> = {}) =>
        validValues({ type: "transfer", transferDirection: "out", ...over });

    it("validates the received amount", () => {
        const missing = validateTransactionForm(transfer({ counterpartAccountId: "w", counterpartAmount: null }));
        expect(missing.counterpartAmount).toBe("Enter the amount received");
        const zero = validateTransactionForm(transfer({ counterpartAccountId: "w", counterpartAmount: 0 }));
        expect(zero.counterpartAmount).toBeDefined();
        expect(validateTransactionForm(transfer({ counterpartAccountId: "w", counterpartAmount: 5 }))).toEqual({});
        expect(validateTransactionForm(transfer({ counterpartAccountId: null }))).toEqual({});
    });

    it("create payload includes the counterpart only for transfers", () => {
        const p = buildCreateTransactionPayload(transfer({ counterpartAccountId: "w", counterpartAmount: 50 }));
        expect(p).toMatchObject({ counterpartAccountId: "w", counterpartAmount: 50 });
        expect(buildCreateTransactionPayload(transfer())).not.toHaveProperty("counterpartAccountId");
        const exp = buildCreateTransactionPayload(validValues({ counterpartAccountId: "w", counterpartAmount: 50 }));
        expect(exp).not.toHaveProperty("counterpartAccountId");
    });

    it("transactionToFormValues reads the counterpart", () => {
        const counterpart = {
            id: "m",
            accountId: "w",
            accountName: "Wallet",
            accountType: "cash" as const,
            amount: "50.00" as unknown as number,
            currencyId: "cur-ils",
        };
        const v = transactionToFormValues(txFixture({ type: "transfer", counterpart }));
        expect(v).toMatchObject({ counterpartAccountId: "w", counterpartAmount: 50 });
        expect(transactionToFormValues(txFixture())).toMatchObject({
            counterpartAccountId: null,
            counterpartAmount: null,
        });
    });

    describe("update payload", () => {
        const manualC = editConstraintsFor(txFixture());
        const init = transactionToFormValues(txFixture({ type: "transfer", transferDirection: "out" }));
        const wired = { ...init, counterpartAccountId: "w1", counterpartAmount: 50 };

        it("sets a counterpart on a synced row without locked fields", () => {
            const syncedC = editConstraintsFor(synced({ type: "expense" }));
            const start = transactionToFormValues(synced({ type: "expense" }));
            const current = {
                ...start,
                type: "transfer" as const,
                transferDirection: "in" as const,
                counterpartAccountId: "w",
                counterpartAmount: 42.5,
                amount: 1,
            };
            expect(buildUpdateTransactionPayload(start, current, syncedC)).toEqual({
                type: "transfer",
                transferDirection: "out",
                counterpartAccountId: "w",
                counterpartAmount: 42.5,
            });
        });

        it("changing the wallet sends account and amount", () => {
            expect(buildUpdateTransactionPayload(wired, { ...wired, counterpartAccountId: "w2" }, manualC)).toEqual({
                counterpartAccountId: "w2",
                counterpartAmount: 50,
            });
        });

        it("clearing sends null and no amount", () => {
            const cleared = { ...wired, counterpartAccountId: null, counterpartAmount: null };
            expect(buildUpdateTransactionPayload(wired, cleared, manualC)).toEqual({ counterpartAccountId: null });
        });

        it("reverting the type sends no counterpart keys", () => {
            expect(buildUpdateTransactionPayload(wired, { ...wired, type: "expense" }, manualC)).toEqual({
                type: "expense",
            });
        });

        it("amount-only change sends just the amount", () => {
            expect(buildUpdateTransactionPayload(wired, { ...wired, counterpartAmount: 60 }, manualC)).toEqual({
                counterpartAmount: 60,
            });
        });
    });

    describe("mirror rows", () => {
        const mirror = txFixture({
            type: "transfer",
            transferDirection: "in",
            counterpartOfId: "src",
            counterpartOf: { id: "src", description: "ATM", accountId: "a", accountName: "Bank" },
        });
        const c = editConstraintsFor(mirror);
        const start = transactionToFormValues(mirror);

        it("flags the mirror and locks everything but notes", () => {
            expect(c.mirror).toBe(true);
            expect(c.source?.id).toBe("src");
            expect(c.locked.has("counterpart")).toBe(true);
            expect(isTypeAllowed("transfer", c)).toBe(true);
            expect(isTypeAllowed("expense", c)).toBe(false);
            expect(isTypeAllowed("income", c)).toBe(false);
        });

        it("only notes can be edited", () => {
            expect(buildUpdateTransactionPayload(start, { ...start, notes: "hi" }, c)).toEqual({ notes: "hi" });
            const everything = {
                ...start,
                amount: 1,
                description: "x",
                categoryId: "cat",
                hidden: true,
                additionalDescription: "y",
                type: "expense" as const,
                counterpartAccountId: "w",
                counterpartAmount: 3,
            };
            expect(buildUpdateTransactionPayload(start, everything, c)).toEqual({});
        });
    });
});

describe("createInitialFormValues prefill", () => {
    const wallet = { id: "w1", type: "cash", currencyId: "cur-ils" } as IAccountResponse;
    const bank = { id: "b1", type: "bank", currencyId: "cur-usd" } as IAccountResponse;
    const cur = [
        { id: "cur-ils", code: "ILS" },
        { id: "cur-usd", code: "USD" },
    ];

    it("applies account, type and category and takes the account's currency", () => {
        const v = createInitialFormValues([bank, wallet], cur, {
            prefill: { accountId: "w1", type: "expense", categoryId: "c1" },
        });
        expect(v).toMatchObject({ accountId: "w1", type: "expense", categoryId: "c1", currencyId: "cur-ils" });
    });

    it("ignores an unknown prefill account", () => {
        const v = createInitialFormValues([bank, wallet], cur, { prefill: { accountId: "nope" } });
        expect(v.accountId).toBeNull();
        expect(v.categoryId).toBeNull();
    });
});

describe("cashFollowupFor", () => {
    const transfer = (over: Partial<ITransactionResponse> = {}) =>
        ({
            type: "transfer",
            transferDirection: "out",
            categoryId: "c1",
            counterpart: {
                id: "m1",
                accountId: "w1",
                accountName: "Cash (ILS)",
                amount: "700" as unknown as number,
                currencyId: "cur-ils",
            },
            ...over,
        }) as ITransactionResponse;

    it("describes an outgoing transfer with a wallet", () => {
        expect(cashFollowupFor(transfer())).toEqual({
            accountId: "w1",
            accountName: "Cash (ILS)",
            amount: 700,
            currencyId: "cur-ils",
            categoryId: "c1",
        });
    });

    it("skips saves that left the wallet link unchanged", () => {
        expect(cashFollowupFor(transfer(), transfer())).toBeNull();
        expect(cashFollowupFor(transfer(), transfer({ counterpart: null }))).not.toBeNull();
        const base = transfer().counterpart!;
        const moved = transfer({ counterpart: { ...base, accountId: "w2" } });
        expect(cashFollowupFor(moved, transfer())).not.toBeNull();
        const resized = transfer({ counterpart: { ...base, amount: "500" as unknown as number } });
        expect(cashFollowupFor(resized, transfer())).not.toBeNull();
    });

    it("returns null for other rows", () => {
        expect(cashFollowupFor(transfer({ counterpart: null }))).toBeNull();
        expect(cashFollowupFor(transfer({ transferDirection: "in" }))).toBeNull();
        expect(cashFollowupFor(transfer({ type: "expense" }))).toBeNull();
    });
});
