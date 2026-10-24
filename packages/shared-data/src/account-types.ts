/** Every account type the API accepts. 'unknown' is reserved for system use (bank-sync auto-created accounts). */
export const ACCOUNT_TYPES = ["credit_card", "bank", "cash", "savings", "unknown"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Manual-ledger types: balance computed from the account's own transactions, one currency, can be a transfer counterpart. */
export const LEDGER_ACCOUNT_TYPES = ["cash", "savings"] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

export function isLedgerAccountType(type: string | null | undefined): type is LedgerAccountType {
    return (LEDGER_ACCOUNT_TYPES as readonly string[]).includes(type ?? "");
}
