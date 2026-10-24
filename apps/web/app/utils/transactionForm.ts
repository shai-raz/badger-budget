import type {
    IAccountResponse,
    ICreateTransaction,
    ICurrencyResponse,
    ITransactionCounterpartSource,
    ITransactionResponse,
    IUpdateTransaction,
} from "@badger/types";
import {
    DEFAULT_CURRENCY_CODE,
    TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH,
    TRANSACTION_NOTES_MAX_LENGTH,
    isLedgerAccountType,
} from "@badger/shared-data";
import { toLocalIsoDate } from "./localDate";

export type TransactionType = "income" | "expense" | "transfer";
export type TransferDirection = "in" | "out";

export interface TransactionFormValues {
    type: TransactionType;
    amount: number | null;
    description: string;
    accountId: string | null;
    date: Date | null;
    categoryId: string | null;
    currencyId: string | null;
    additionalDescription: string;
    notes: string;
    hidden: boolean;
    transferDirection: TransferDirection;
    counterpartAccountId: string | null;
    counterpartAmount: number | null;
}

export type TransactionFormErrors = Partial<Record<keyof TransactionFormValues, string>>;

export type CreateTransactionPayload = Pick<
    ICreateTransaction,
    | "accountId"
    | "type"
    | "amount"
    | "currencyId"
    | "description"
    | "transactionDate"
    | "categoryId"
    | "additionalDescription"
    | "notes"
    | "hidden"
    | "transferDirection"
    | "counterpartAccountId"
    | "counterpartAmount"
>;

/** Show the notes character counter once the text reaches this length. */
export const NOTES_COUNTER_FROM = 900;

type CurrencyRef = Pick<ICurrencyResponse, "id" | "code">;

/** The currency used by most accounts (ties go to the first seen); null if none is usable. */
function mostCommonCurrencyId(
    accounts: Pick<IAccountResponse, "currencyId">[],
    currencies: CurrencyRef[],
): string | null {
    const counts = new Map<string, number>();
    for (const a of accounts) {
        if (a.currencyId && currencies.some((c) => c.id === a.currencyId)) {
            counts.set(a.currencyId, (counts.get(a.currencyId) ?? 0) + 1);
        }
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [id, n] of counts) {
        if (n > bestCount) {
            best = id;
            bestCount = n;
        }
    }
    return best;
}

/** selected account's currency -> most common among all accounts -> locale code -> DEFAULT_CURRENCY_CODE (ILS) -> first currency -> null */
export function resolveDefaultCurrencyId(
    account: Pick<IAccountResponse, "currencyId"> | null | undefined,
    currencies: CurrencyRef[],
    localeCode: string,
    allAccounts: Pick<IAccountResponse, "currencyId">[] = [],
): string | null {
    if (account?.currencyId && currencies.some((c) => c.id === account.currencyId)) {
        return account.currencyId;
    }
    const common = mostCommonCurrencyId(allAccounts, currencies);
    if (common) return common;
    const byCode = (code: string) => currencies.find((c) => c.code === code);
    return byCode(localeCode)?.id ?? byCode(DEFAULT_CURRENCY_CODE)?.id ?? currencies[0]?.id ?? null;
}

/**
 * Compact label for the closed currency picker: the symbol, or "symbol code" when another
 * currency in the list shares that symbol.
 */
export function currencyDisplayLabel(
    currency: Pick<ICurrencyResponse, "id" | "code" | "symbol">,
    currencies: Pick<ICurrencyResponse, "id" | "symbol">[],
): string {
    const ambiguous = currencies.some((c) => c.id !== currency.id && c.symbol === currency.symbol);
    return ambiguous ? `${currency.symbol} ${currency.code}` : currency.symbol;
}

export interface TransactionFormPrefill {
    accountId?: string;
    type?: TransactionType;
    categoryId?: string | null;
}

export function createInitialFormValues(
    accounts: IAccountResponse[],
    currencies: CurrencyRef[],
    opts: { now?: Date; localeCurrencyCode?: string; prefill?: TransactionFormPrefill } = {},
): TransactionFormValues {
    const prefill = opts.prefill;
    const prefilled = prefill?.accountId ? accounts.find((a) => a.id === prefill.accountId) : undefined;
    const account = prefilled ?? (accounts.length === 1 ? accounts[0]! : null);
    return {
        type: prefill?.type ?? "expense",
        amount: null,
        description: "",
        accountId: account?.id ?? null,
        date: opts.now ?? new Date(),
        categoryId: prefill?.categoryId ?? null,
        currencyId: resolveDefaultCurrencyId(
            account,
            currencies,
            opts.localeCurrencyCode ?? DEFAULT_CURRENCY_CODE,
            accounts,
        ),
        additionalDescription: "",
        notes: "",
        hidden: false,
        transferDirection: "out",
        counterpartAccountId: null,
        counterpartAmount: null,
    };
}

export interface CashFollowup {
    accountId: string;
    accountName: string;
    amount: number;
    currencyId: string;
    categoryId: string | null;
}

/**
 * For an outgoing transfer linked to a wallet (cash counterparts only; savings never prompt): what the
 * "Record a cash payment" toast needs; otherwise null.
 * Pass `previous` (the row before an edit) to skip saves that left the wallet link unchanged.
 */
export function cashFollowupFor(tx: ITransactionResponse, previous?: ITransactionResponse): CashFollowup | null {
    if (tx.type !== "transfer" || tx.transferDirection !== "out" || !tx.counterpart) return null;
    if (tx.counterpart.accountType !== "cash") return null;
    const before = previous?.counterpart;
    if (
        before &&
        before.accountId === tx.counterpart.accountId &&
        Number(before.amount) === Number(tx.counterpart.amount)
    ) {
        return null;
    }
    return {
        accountId: tx.counterpart.accountId,
        accountName: tx.counterpart.accountName,
        amount: Number(tx.counterpart.amount),
        currencyId: tx.counterpart.currencyId,
        categoryId: tx.categoryId ?? null,
    };
}

export function validateTransactionForm(v: TransactionFormValues): TransactionFormErrors {
    const errors: TransactionFormErrors = {};
    if (v.amount === null || v.amount === undefined || Number.isNaN(v.amount)) {
        errors.amount = "Enter an amount";
    } else if (v.amount <= 0) {
        errors.amount = "Amount must be greater than 0";
    }
    if (!v.description.trim()) errors.description = "Enter a description";
    if (!v.accountId) errors.accountId = "Choose an account";
    if (!v.date) errors.date = "Pick a date";
    if (!v.currencyId) errors.currencyId = "Choose a currency";
    if (v.additionalDescription.length > TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH) {
        errors.additionalDescription = `Must be at most ${TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH} characters`;
    }
    if (v.notes.length > TRANSACTION_NOTES_MAX_LENGTH) {
        errors.notes = `Must be at most ${TRANSACTION_NOTES_MAX_LENGTH} characters`;
    }
    if (
        v.type === "transfer" &&
        v.counterpartAccountId &&
        (v.counterpartAmount === null || Number.isNaN(v.counterpartAmount) || v.counterpartAmount <= 0)
    ) {
        errors.counterpartAmount = "Enter the amount received";
    }
    return errors;
}

/** Call only when the form is valid; throws if a required field is null. */
export function buildCreateTransactionPayload(v: TransactionFormValues): CreateTransactionPayload {
    if (v.amount === null || !v.accountId || !v.date || !v.currencyId) {
        throw new Error("Cannot build a transaction payload from an incomplete form");
    }
    const payload: CreateTransactionPayload = {
        accountId: v.accountId,
        type: v.type,
        amount: v.amount,
        currencyId: v.currencyId,
        description: v.description.trim(),
        transactionDate: toLocalIsoDate(v.date),
        hidden: !!v.hidden,
    };
    if (v.categoryId) payload.categoryId = v.categoryId;
    const additionalDescription = v.additionalDescription.trim();
    if (additionalDescription) payload.additionalDescription = additionalDescription;
    const notes = v.notes.trim();
    if (notes) payload.notes = notes;
    if (v.type === "transfer") {
        payload.transferDirection = v.transferDirection;
        if (v.counterpartAccountId && v.counterpartAmount !== null) {
            payload.counterpartAccountId = v.counterpartAccountId;
            payload.counterpartAmount = v.counterpartAmount;
        }
    }
    return payload;
}

export type LockableField =
    | "amount"
    | "currencyId"
    | "date"
    | "accountId"
    | "description"
    | "transferDirection"
    | "type"
    | "categoryId"
    | "additionalDescription"
    | "hidden"
    | "counterpart";

export interface EditConstraints {
    synced: boolean;
    /** A transfer mirror row: read-only except notes. */
    mirror: boolean;
    source: ITransactionCounterpartSource | null;
    locked: ReadonlySet<LockableField>;
    bankDirection: TransferDirection | null;
}

export const LOCKED_FIELD_TOOLTIP = "From your bank — can't be edited";
export const LOCKED_DIRECTION_TOOLTIP = "Direction comes from your bank";
export const MIRROR_TOOLTIP = (s: ITransactionCounterpartSource | null) =>
    s
        ? `Follows the transfer “${s.description}” on ${s.accountName}. Edit that one instead.`
        : "Follows a linked transfer";

const SYNCED_LOCKED: LockableField[] = [
    "amount",
    "currencyId",
    "date",
    "accountId",
    "description",
    "transferDirection",
];
const ALL_LOCKABLE: LockableField[] = [
    ...SYNCED_LOCKED,
    "type",
    "categoryId",
    "additionalDescription",
    "hidden",
    "counterpart",
];

/** A transaction imported by bank sync (has an external id) has bank-owned fields. */
export function isSyncedTransaction(tx: { externalId?: string | null }): boolean {
    return !!tx.externalId;
}

/** The money direction a transaction has, whatever its type. */
export function bankDirection(tx: {
    type: TransactionType;
    transferDirection?: TransferDirection | null;
}): TransferDirection {
    if (tx.type === "income") return "in";
    if (tx.type === "transfer") return tx.transferDirection === "in" ? "in" : "out";
    return "out";
}

export function editConstraintsFor(tx: {
    externalId?: string | null;
    type: TransactionType;
    transferDirection?: TransferDirection | null;
    counterpartOfId?: string | null;
    counterpartOf?: ITransactionCounterpartSource | null;
}): EditConstraints {
    if (tx.counterpartOfId) {
        return {
            synced: false,
            mirror: true,
            source: tx.counterpartOf ?? null,
            locked: new Set(ALL_LOCKABLE),
            bankDirection: tx.transferDirection === "in" ? "in" : "out",
        };
    }
    if (!isSyncedTransaction(tx)) {
        return { synced: false, mirror: false, source: null, locked: new Set(), bankDirection: null };
    }
    return {
        synced: true,
        mirror: false,
        source: null,
        locked: new Set(SYNCED_LOCKED),
        bankDirection: bankDirection(tx),
    };
}

/** Same rule as the API's defaultCounterpartAmount (R3). */
export function defaultCounterpartAmount(
    src: {
        amount: number | null;
        currencyId: string | null;
        originalAmount?: number | null;
        originalCurrencyId?: string | null;
    },
    walletCurrencyId: string | null,
): number | null {
    if (!walletCurrencyId) return null;
    if (walletCurrencyId === src.currencyId) return src.amount === null ? null : Number(src.amount);
    if (src.originalCurrencyId && walletCurrencyId === src.originalCurrencyId && src.originalAmount != null) {
        return Number(src.originalAmount);
    }
    return null;
}

/** Cash and savings accounts selectable as counterpart: ledger accounts, not the source account. */
export function counterpartOptions(accounts: IAccountResponse[], sourceAccountId: string | null): IAccountResponse[] {
    return accounts.filter((a) => isLedgerAccountType(a.type) && a.id !== sourceAccountId);
}

/** Currency the wallet should be in: originalCurrencyId when set (edit of a foreign charge), else the form currency. */
export function neededCounterpartCurrencyId(
    values: TransactionFormValues,
    tx?: Pick<ITransactionResponse, "originalCurrencyId"> | null,
): string | null {
    return tx?.originalCurrencyId ?? values.currencyId;
}

/** Label for the counterpart field. */
export const counterpartLabel = (dir: TransferDirection) => (dir === "out" ? "To account" : "From account");

/** Ledger accounts (cash and savings) always use their own currency. */
export function isCurrencyLockedByAccount(
    account: Pick<IAccountResponse, "type" | "currencyId"> | null | undefined,
): boolean {
    return isLedgerAccountType(account?.type) && !!account.currencyId;
}

/**
 * Currency a ledger account (cash or savings) forces on the form after the account changes, or null when nothing should change.
 * In edit mode a locked currency field (synced row) is left alone.
 */
export function currencyForAccountChange(
    account: Pick<IAccountResponse, "type" | "currencyId"> | null | undefined,
    opts: { isEdit: boolean; currencyLocked: boolean },
): string | null {
    if (!isCurrencyLockedByAccount(account) || !account?.currencyId) return null;
    if (opts.isEdit && opts.currencyLocked) return null;
    return account.currencyId;
}

/** Keep the stored received amount only while the source amount and currency are still the initial ones. */
export function shouldKeepInitialCounterpartAmount(
    initial: Pick<TransactionFormValues, "counterpartAccountId" | "counterpartAmount" | "amount" | "currencyId">,
    current: Pick<TransactionFormValues, "amount" | "currencyId">,
    counterpartAccountId: string | null,
): boolean {
    return (
        initial.counterpartAccountId === counterpartAccountId &&
        initial.counterpartAmount !== null &&
        initial.amount === current.amount &&
        initial.currencyId === current.currencyId
    );
}

/** Synced rows keep their bank direction: out -> expense/transfer, in -> income/transfer. */
export function isTypeAllowed(type: TransactionType, c: EditConstraints): boolean {
    if (c.mirror) return type === "transfer";
    if (!c.synced) return true;
    if (type === "transfer") return true;
    return c.bankDirection === "in" ? type === "income" : type === "expense";
}

export function directionForTypeChange(
    newType: TransactionType,
    prev: { type: TransactionType; transferDirection: TransferDirection },
    c: EditConstraints,
): TransferDirection {
    if (c.synced && c.bankDirection) return c.bankDirection;
    if (prev.type === "transfer") return prev.transferDirection;
    return prev.type === "income" ? "in" : "out";
}

/** Local midnight of the calendar day in an ISO string / Date (read as UTC Y-M-D). */
export function parseDateOnly(v: string | Date): Date {
    const d = typeof v === "string" ? new Date(v) : v;
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function transactionToFormValues(tx: ITransactionResponse): TransactionFormValues {
    return {
        type: tx.type,
        amount: Number(tx.amount),
        description: tx.description,
        accountId: tx.accountId,
        date: parseDateOnly(tx.transactionDate),
        categoryId: tx.categoryId ?? null,
        currencyId: tx.currencyId,
        additionalDescription: tx.additionalDescription ?? "",
        notes: tx.notes ?? "",
        hidden: !!tx.hidden,
        transferDirection: tx.transferDirection ?? (tx.type === "income" ? "in" : "out"),
        counterpartAccountId: tx.counterpart?.accountId ?? null,
        counterpartAmount: tx.counterpart ? Number(tx.counterpart.amount) : null,
    };
}

export type UpdateTransactionPayload = Partial<IUpdateTransaction>;

/** The transaction as it reads after `data` was PATCHed (same shallow merge the optimistic cache update uses). */
export function applyUpdateToTransaction(
    tx: ITransactionResponse,
    data: UpdateTransactionPayload,
): ITransactionResponse {
    return { ...tx, ...data } as ITransactionResponse;
}

const cents = (n: number | null) => (n === null || Number.isNaN(n) ? null : Math.round(n * 100));
const dayOf = (d: Date | null) => (d ? toLocalIsoDate(d) : null);

/** Form fields that differ between `initial` and `current`, minus locked ones. */
function changedKeys(
    initial: TransactionFormValues,
    current: TransactionFormValues,
    c: EditConstraints,
): Set<keyof TransactionFormValues> {
    const out = new Set<keyof TransactionFormValues>();
    const open = (f: LockableField) => !c.locked.has(f);
    if (open("amount") && cents(initial.amount) !== cents(current.amount)) out.add("amount");
    if (open("currencyId") && initial.currencyId !== current.currencyId) out.add("currencyId");
    if (open("date") && dayOf(initial.date) !== dayOf(current.date)) out.add("date");
    if (open("accountId") && initial.accountId !== current.accountId) out.add("accountId");
    if (open("description") && initial.description.trim() !== current.description.trim()) out.add("description");
    if (
        open("additionalDescription") &&
        initial.additionalDescription.trim() !== current.additionalDescription.trim()
    ) {
        out.add("additionalDescription");
    }
    if (initial.notes.trim() !== current.notes.trim()) out.add("notes");
    if (open("categoryId") && (initial.categoryId ?? null) !== (current.categoryId ?? null)) out.add("categoryId");
    if (open("hidden") && !!initial.hidden !== !!current.hidden) out.add("hidden");
    if (open("type") && initial.type !== current.type) out.add("type");
    if (
        open("transferDirection") &&
        initial.type === "transfer" &&
        current.type === "transfer" &&
        initial.transferDirection !== current.transferDirection
    ) {
        out.add("transferDirection");
    }
    if (open("counterpart") && current.type === "transfer") {
        const accountChanged = (initial.counterpartAccountId ?? null) !== (current.counterpartAccountId ?? null);
        if (accountChanged) out.add("counterpartAccountId");
        if (
            cents(initial.counterpartAmount) !== cents(current.counterpartAmount) ||
            (accountChanged && current.counterpartAccountId)
        ) {
            out.add("counterpartAmount");
        }
    }
    return out;
}

/** The PATCH body for what the user actually changed; `{}` when nothing changed. */
export function buildUpdateTransactionPayload(
    initial: TransactionFormValues,
    current: TransactionFormValues,
    c: EditConstraints,
): UpdateTransactionPayload {
    const changed = changedKeys(initial, current, c);
    const payload: UpdateTransactionPayload = {};
    if (changed.has("amount") && current.amount !== null) payload.amount = current.amount;
    if (changed.has("currencyId") && current.currencyId) payload.currencyId = current.currencyId;
    if (changed.has("date") && current.date) payload.transactionDate = toLocalIsoDate(current.date);
    if (changed.has("accountId") && current.accountId) payload.accountId = current.accountId;
    if (changed.has("description")) payload.description = current.description.trim();
    if (changed.has("additionalDescription")) {
        payload.additionalDescription = current.additionalDescription.trim() || null;
    }
    if (changed.has("notes")) payload.notes = current.notes.trim() || null;
    if (changed.has("categoryId")) payload.categoryId = current.categoryId ?? null;
    if (changed.has("hidden")) payload.hidden = !!current.hidden;
    if (changed.has("type")) {
        payload.type = current.type;
        // transferDirection is a locked field on synced rows, but the server still needs one on a new transfer
        if (current.type === "transfer") payload.transferDirection = c.bankDirection ?? current.transferDirection;
    } else if (changed.has("transferDirection")) {
        payload.transferDirection = current.transferDirection;
    }
    if (changed.has("counterpartAccountId")) payload.counterpartAccountId = current.counterpartAccountId ?? null;
    if (changed.has("counterpartAmount") && current.counterpartAccountId && current.counterpartAmount !== null) {
        payload.counterpartAmount = current.counterpartAmount;
    }
    return payload;
}

export function isEditDirty(
    initial: TransactionFormValues,
    current: TransactionFormValues,
    c: EditConstraints,
): boolean {
    return Object.keys(buildUpdateTransactionPayload(initial, current, c)).length > 0;
}

/** Validation limited to fields the user changed, so legacy invalid synced data never blocks saving. */
export function validateTransactionEdit(
    initial: TransactionFormValues,
    current: TransactionFormValues,
    c: EditConstraints,
): TransactionFormErrors {
    const changed = changedKeys(initial, current, c);
    const errors = validateTransactionForm(current);
    const kept: TransactionFormErrors = {};
    for (const key of Object.keys(errors) as (keyof TransactionFormValues)[]) {
        if (changed.has(key)) kept[key] = errors[key];
    }
    return kept;
}
