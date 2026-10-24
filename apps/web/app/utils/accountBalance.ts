import type { IAccountResponse } from "@badger/types";
import { calendarDaysUntil } from "./relativeTime";

export type BalanceDisplay =
    | { kind: "account_balance"; label: "Current balance"; amount: number; tone: "neutral" }
    | { kind: "next_charge"; label: "Upcoming charge"; amount: number; tone: "negative"; chargeDate: Date | null }
    | {
          kind: "utilized_credit";
          label: "Used this cycle";
          amount: number;
          tone: "neutral";
          limit: number | null;
          utilizationPct: number | null;
      }
    | { kind: "cash_on_hand"; label: "Cash on hand"; amount: number; tone: "neutral"; balanceSet: boolean };

/**
 * The one place that interprets `balance`/`balanceKind` into something displayable —
 * negation, abs, and utilization-percentage math all happen here and nowhere else (spec R5.2).
 * Returns `null` when the account has no interpretable balance (`balance` or `balanceKind` is null).
 */
export function getBalanceDisplay(account: IAccountResponse): BalanceDisplay | null {
    if (account.balance === null || account.balanceKind === null) {
        return null;
    }

    switch (account.balanceKind) {
        case "account_balance":
            return { kind: "account_balance", label: "Current balance", amount: account.balance, tone: "neutral" };
        case "next_charge":
            return {
                kind: "next_charge",
                label: "Upcoming charge",
                amount: Math.abs(account.balance),
                tone: "negative",
                chargeDate: account.balanceDate,
            };
        case "cash_on_hand":
            return {
                kind: "cash_on_hand",
                label: "Cash on hand",
                amount: account.balance,
                tone: "neutral",
                balanceSet: account.balance >= 0,
            };
        case "utilized_credit": {
            const amount = Math.abs(account.balance);
            const limit = account.cardFrame !== null && account.cardFrame > 0 ? account.cardFrame : null;
            return {
                kind: "utilized_credit",
                label: "Used this cycle",
                amount,
                tone: "neutral",
                limit,
                utilizationPct: limit ? Math.round((amount / limit) * 100) : null,
            };
        }
    }
}

const BALANCE_KIND_ORDER: Record<BalanceDisplay["kind"], number> = {
    account_balance: 0,
    next_charge: 1,
    utilized_credit: 1,
    cash_on_hand: 2,
};

/**
 * Keeps only accounts with an interpretable balance, ordered account_balance
 * first, then next_charge/utilized_credit, ties broken by name.
 */
export function balanceAccounts(accounts: IAccountResponse[]): IAccountResponse[] {
    return accounts
        .filter((account) => getBalanceDisplay(account) !== null)
        .sort((a, b) => {
            const orderDiff =
                BALANCE_KIND_ORDER[getBalanceDisplay(a)!.kind] - BALANCE_KIND_ORDER[getBalanceDisplay(b)!.kind];
            return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name);
        });
}

/**
 * Every account in display order: the balance-bearing ones first (balanceAccounts order), then the
 * no-balance ones by name. Use this where all accounts show; Overview keeps balanceAccounts.
 */
export function sortAccountsForDisplay(accounts: IAccountResponse[]): IAccountResponse[] {
    const noBalance = accounts
        .filter((account) => getBalanceDisplay(account) === null)
        .sort((a, b) => a.name.localeCompare(b.name));
    return [...balanceAccounts(accounts), ...noBalance];
}

/** The type caption under an account name: "Bank account", "Credit card", "Cash", "Savings", otherwise "Account". */
export function accountTypeCaption(type: string): string {
    switch (type) {
        case "bank":
            return "Bank account";
        case "credit_card":
            return "Credit card";
        case "cash":
            return "Cash";
        case "savings":
            return "Savings";
        default:
            return "Account";
    }
}

/**
 * The caption under an account name. On the manage page the account number follows it, so two
 * similar accounts (two cards from one issuer) tell apart. Shared by the row and the tile.
 */
export function accountCaption(account: IAccountResponse, manageable: boolean): string {
    const caption = accountTypeCaption(account.type);
    return manageable && account.accountNumber ? `${caption} · ${account.accountNumber}` : caption;
}

/**
 * Sums `account_balance` accounts only — the only kind meaningful to sum (spec R5.2).
 * `null` when there are none, or when they span more than one currency.
 */
export function sumBankBalances(
    accounts: IAccountResponse[],
): { total: number; currencyCode: string | undefined } | null {
    const banks = accounts.filter((account) => getBalanceDisplay(account)?.kind === "account_balance");
    if (banks.length === 0) {
        return null;
    }

    const currencyKeys = new Set(banks.map((account) => account.currency?.code ?? account.currencyId ?? undefined));
    if (currencyKeys.size > 1) {
        return null;
    }

    return {
        total: banks.reduce((sum, account) => sum + (account.balance ?? 0), 0),
        currencyCode: banks[0]!.currency?.code,
    };
}

const toDate = (date: Date | string): Date => (typeof date === "string" ? new Date(date) : date);

// en-GB gives "D Mon" (12 Oct); en-US would order it "Oct 12".
const formatShortDate = (date: Date): string => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** "Charges 12 Oct · in N days" / "· in 1 day" / "· today" / bare (no suffix) when in the past. */
export function formatChargeLine(chargeDate: Date | string, now: Date = new Date()): string {
    const date = toDate(chargeDate);
    const days = calendarDaysUntil(date, now);
    const base = `Charges ${formatShortDate(date)}`;

    if (days > 1) return `${base} · in ${days} days`;
    if (days === 1) return `${base} · in 1 day`;
    if (days === 0) return `${base} · today`;
    return base;
}

/** Compact mobile label: "Upcoming · 12 Oct". */
export function formatChargeLabelShort(chargeDate: Date | string): string {
    return `Upcoming · ${formatShortDate(toDate(chargeDate))}`;
}

/**
 * The mobile row's subtitle under the account name. On the manage page it is the caption with the
 * account number, whatever the balance kind (the balance sits on the right). Elsewhere it is the
 * balance label, or the type caption when the account has no balance.
 */
export function accountRowSubtitle(account: IAccountResponse, manageable: boolean): string {
    if (manageable) {
        return accountCaption(account, true);
    }
    const display = getBalanceDisplay(account);
    if (!display) {
        return accountCaption(account, false);
    }
    if (display.kind === "next_charge" && display.chargeDate) {
        return formatChargeLabelShort(display.chargeDate);
    }
    return display.label;
}
