import type { IAccountResponse } from "@badger/types";
import { describe, expect, it } from "vitest";
import {
    accountCaption,
    accountRowSubtitle,
    accountTypeCaption,
    balanceAccounts,
    formatChargeLabelShort,
    formatChargeLine,
    getBalanceDisplay,
    sortAccountsForDisplay,
    sumBankBalances,
} from "./accountBalance";

const NOW = new Date("2026-06-15T12:00:00");

function account(overrides: Partial<IAccountResponse> & { id: string; name: string }): IAccountResponse {
    return {
        accountNumber: null,
        type: "bank",
        icon: null,
        color: null,
        currencyId: "ILS",
        currency: null,
        balance: null,
        balanceKind: null,
        balanceDate: null,
        balanceUpdatedAt: null,
        cardFrame: null,
        cardIssuer: null,
        hasLinkedTransfers: false,
        hasTransactions: false,
        lastTransactionDate: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    };
}

describe("getBalanceDisplay", () => {
    it("returns null when balance is null", () => {
        expect(
            getBalanceDisplay(account({ id: "1", name: "A", balance: null, balanceKind: "account_balance" })),
        ).toBeNull();
    });

    it("returns null when balanceKind is null", () => {
        expect(getBalanceDisplay(account({ id: "1", name: "A", balance: 100, balanceKind: null }))).toBeNull();
    });

    it("account_balance: amount is the balance as-is, including negative overdraft", () => {
        expect(
            getBalanceDisplay(account({ id: "1", name: "A", balance: -250, balanceKind: "account_balance" })),
        ).toEqual({ kind: "account_balance", label: "Current balance", amount: -250, tone: "neutral" });
    });

    it("next_charge: amount is abs(balance), carries chargeDate", () => {
        const chargeDate = new Date("2026-10-12");
        expect(
            getBalanceDisplay(
                account({ id: "1", name: "A", balance: -300, balanceKind: "next_charge", balanceDate: chargeDate }),
            ),
        ).toEqual({ kind: "next_charge", label: "Upcoming charge", amount: 300, tone: "negative", chargeDate });
    });

    it("utilized_credit: cardFrame > 0 gives limit and a rounded utilizationPct", () => {
        expect(
            getBalanceDisplay(
                account({ id: "1", name: "A", balance: -450, balanceKind: "utilized_credit", cardFrame: 1000 }),
            ),
        ).toEqual({
            kind: "utilized_credit",
            label: "Used this cycle",
            amount: 450,
            tone: "neutral",
            limit: 1000,
            utilizationPct: 45,
        });
    });

    it("utilized_credit: utilizationPct is uncapped past 100", () => {
        const display = getBalanceDisplay(
            account({ id: "1", name: "A", balance: -1500, balanceKind: "utilized_credit", cardFrame: 1000 }),
        );
        expect(display).toMatchObject({ utilizationPct: 150 });
    });

    it("utilized_credit: cardFrame null gives limit null and utilizationPct null", () => {
        const display = getBalanceDisplay(
            account({ id: "1", name: "A", balance: -450, balanceKind: "utilized_credit", cardFrame: null }),
        );
        expect(display).toMatchObject({ limit: null, utilizationPct: null });
    });

    it("utilized_credit: cardFrame 0 treated as null (not a real limit)", () => {
        const display = getBalanceDisplay(
            account({ id: "1", name: "A", balance: -450, balanceKind: "utilized_credit", cardFrame: 0 }),
        );
        expect(display).toMatchObject({ limit: null, utilizationPct: null });
    });
});

describe("balanceAccounts", () => {
    it("filters out accounts with no interpretable balance", () => {
        const accounts = [
            account({ id: "1", name: "No balance", balance: null, balanceKind: "account_balance" }),
            account({ id: "2", name: "No kind", balance: 100, balanceKind: null }),
            account({ id: "3", name: "Valid", balance: 100, balanceKind: "account_balance" }),
        ];
        expect(balanceAccounts(accounts).map((a) => a.id)).toEqual(["3"]);
    });

    it("orders account_balance first, then next_charge/utilized_credit, bank 'Z' before card 'A'", () => {
        const accounts = [
            account({ id: "card-a", name: "A Card", balance: -100, balanceKind: "utilized_credit", cardFrame: 500 }),
            account({ id: "bank-z", name: "Z Bank", balance: 500, balanceKind: "account_balance" }),
        ];
        expect(balanceAccounts(accounts).map((a) => a.id)).toEqual(["bank-z", "card-a"]);
    });

    it("breaks ties within a kind group by name", () => {
        const accounts = [
            account({ id: "b", name: "Bravo", balance: 100, balanceKind: "account_balance" }),
            account({ id: "a", name: "Alpha", balance: 100, balanceKind: "account_balance" }),
        ];
        expect(balanceAccounts(accounts).map((a) => a.id)).toEqual(["a", "b"]);
    });

    it("groups next_charge and utilized_credit together, ordered by name", () => {
        const accounts = [
            account({ id: "charge", name: "Zeta Charge", balance: -50, balanceKind: "next_charge" }),
            account({ id: "credit", name: "Alpha Credit", balance: -50, balanceKind: "utilized_credit" }),
        ];
        expect(balanceAccounts(accounts).map((a) => a.id)).toEqual(["credit", "charge"]);
    });
});

describe("sumBankBalances", () => {
    it("sums only account_balance accounts", () => {
        const accounts = [
            account({
                id: "1",
                name: "A",
                balance: 100,
                balanceKind: "account_balance",
                currency: { code: "ILS" } as never,
            }),
            account({
                id: "2",
                name: "B",
                balance: 200,
                balanceKind: "account_balance",
                currency: { code: "ILS" } as never,
            }),
            account({ id: "3", name: "C", balance: -50, balanceKind: "utilized_credit" }),
        ];
        expect(sumBankBalances(accounts)).toEqual({ total: 300, currencyCode: "ILS" });
    });

    it("returns null when there are no bank accounts", () => {
        const accounts = [account({ id: "1", name: "A", balance: -50, balanceKind: "utilized_credit" })];
        expect(sumBankBalances(accounts)).toBeNull();
    });

    it("returns null when bank accounts span more than one currency", () => {
        const accounts = [
            account({
                id: "1",
                name: "A",
                balance: 100,
                balanceKind: "account_balance",
                currency: { code: "ILS" } as never,
            }),
            account({
                id: "2",
                name: "B",
                balance: 200,
                balanceKind: "account_balance",
                currency: { code: "USD" } as never,
            }),
        ];
        expect(sumBankBalances(accounts)).toBeNull();
    });
});

describe("formatChargeLine", () => {
    it("today", () => {
        expect(formatChargeLine(new Date("2026-06-15T09:00:00"), NOW)).toBe("Charges 15 Jun · today");
    });

    it("tomorrow (1 day, singular)", () => {
        expect(formatChargeLine(new Date("2026-06-16T09:00:00"), NOW)).toBe("Charges 16 Jun · in 1 day");
    });

    it("in 5 days", () => {
        expect(formatChargeLine(new Date("2026-06-20T09:00:00"), NOW)).toBe("Charges 20 Jun · in 5 days");
    });

    it("in the past has no suffix", () => {
        expect(formatChargeLine(new Date("2026-06-10T09:00:00"), NOW)).toBe("Charges 10 Jun");
    });
});

describe("formatChargeLabelShort", () => {
    it("renders the compact mobile form", () => {
        expect(formatChargeLabelShort(new Date("2026-10-12T09:00:00"))).toBe("Upcoming · 12 Oct");
    });
});

describe("cash_on_hand", () => {
    const cash = (id: string, balance: number) =>
        account({ id, name: id, type: "cash", balance, balanceKind: "cash_on_hand" });

    it("displays positive and negative balances, flagging negatives as not set", () => {
        expect(getBalanceDisplay(cash("w", 56.6))).toEqual({
            kind: "cash_on_hand",
            label: "Cash on hand",
            amount: 56.6,
            tone: "neutral",
            balanceSet: true,
        });
        expect(getBalanceDisplay(cash("w", -3))).toMatchObject({ amount: -3, balanceSet: false });
    });

    it("orders after cards and is excluded from sumBankBalances", () => {
        const bank = account({ id: "b", name: "Bank", balance: 100, balanceKind: "account_balance" });
        const card = account({ id: "c", name: "Card", balance: -50, balanceKind: "utilized_credit" });
        const wallet = cash("a-wallet", 20);
        expect(balanceAccounts([wallet, card, bank]).map((a) => a.id)).toEqual(["b", "c", "a-wallet"]);
        expect(sumBankBalances([bank, wallet])).toEqual({ total: 100, currencyCode: undefined });
    });
});

describe("sortAccountsForDisplay", () => {
    it("puts balance-bearing accounts first in balanceAccounts order, then no-balance accounts by name", () => {
        const accounts = [
            account({ id: "none-z", name: "Zeta wallet" }),
            account({ id: "card", name: "Card", balance: -50, balanceKind: "utilized_credit", cardFrame: 500 }),
            account({ id: "none-a", name: "Alpha" }),
            account({ id: "bank", name: "Bank", balance: 500, balanceKind: "account_balance" }),
        ];
        expect(sortAccountsForDisplay(accounts).map((a) => a.id)).toEqual(["bank", "card", "none-a", "none-z"]);
    });

    it("keeps every account, and does not mutate the input order", () => {
        const accounts = [account({ id: "b", name: "B" }), account({ id: "a", name: "A" })];
        expect(sortAccountsForDisplay(accounts).map((a) => a.id)).toEqual(["a", "b"]);
        expect(accounts.map((a) => a.id)).toEqual(["b", "a"]);
    });
});

describe("accountCaption", () => {
    it("is the type caption alone when not manageable", () => {
        expect(
            accountCaption(account({ id: "a", name: "Card", type: "credit_card", accountNumber: "1234" }), false),
        ).toBe("Credit card");
    });

    it("appends the account number when manageable", () => {
        expect(
            accountCaption(account({ id: "a", name: "Card", type: "credit_card", accountNumber: "1234" }), true),
        ).toBe("Credit card · 1234");
    });

    it("omits the number when the account has none", () => {
        expect(accountCaption(account({ id: "a", name: "Cash", type: "cash" }), true)).toBe("Cash");
    });
});

describe("accountRowSubtitle", () => {
    it("is the caption with the account number when manageable, whatever the balance kind", () => {
        const card = { id: "a", name: "Card", type: "credit_card" as const, accountNumber: "1234" };
        expect(accountRowSubtitle(account({ ...card, balance: -300, balanceKind: "utilized_credit" }), true)).toBe(
            "Credit card · 1234",
        );
        expect(
            accountRowSubtitle(
                account({ ...card, balance: -300, balanceKind: "next_charge", balanceDate: new Date("2026-10-12") }),
                true,
            ),
        ).toBe("Credit card · 1234");
        expect(accountRowSubtitle(account({ ...card, balance: 500, balanceKind: "account_balance" }), true)).toBe(
            "Credit card · 1234",
        );
    });

    it("is the balance label when not manageable", () => {
        expect(
            accountRowSubtitle(account({ id: "a", name: "A", balance: 1, balanceKind: "account_balance" }), false),
        ).toBe("Current balance");
        expect(
            accountRowSubtitle(account({ id: "a", name: "A", balance: 1, balanceKind: "utilized_credit" }), false),
        ).toBe("Used this cycle");
        expect(
            accountRowSubtitle(account({ id: "a", name: "A", balance: 1, balanceKind: "cash_on_hand" }), false),
        ).toBe("Cash on hand");
    });

    it("is the compact charge label for a next_charge with a date, and the plain label without one", () => {
        expect(
            accountRowSubtitle(
                account({
                    id: "a",
                    name: "A",
                    balance: -300,
                    balanceKind: "next_charge",
                    balanceDate: new Date("2026-10-12T09:00:00"),
                }),
                false,
            ),
        ).toBe("Upcoming · 12 Oct");
        expect(
            accountRowSubtitle(account({ id: "a", name: "A", balance: -300, balanceKind: "next_charge" }), false),
        ).toBe("Upcoming charge");
    });

    it("falls back to the type caption when there is no balance", () => {
        expect(accountRowSubtitle(account({ id: "a", name: "A", type: "cash" }), false)).toBe("Cash");
        expect(
            accountRowSubtitle(account({ id: "a", name: "A", type: "credit_card", accountNumber: "1234" }), false),
        ).toBe("Credit card");
        expect(
            accountRowSubtitle(account({ id: "a", name: "A", type: "credit_card", accountNumber: "1234" }), true),
        ).toBe("Credit card · 1234");
    });
});

describe("savings accounts", () => {
    it("are an account balance, counted in the bank total while cash on hand is not", () => {
        const savings = account({
            id: "s",
            name: "Savings",
            type: "savings",
            balance: 500,
            balanceKind: "account_balance",
        });
        const bank = account({ id: "b", name: "Bank", balance: 100, balanceKind: "account_balance" });
        const wallet = account({ id: "c", name: "Wallet", type: "cash", balance: 20, balanceKind: "cash_on_hand" });
        expect(getBalanceDisplay(savings)).toMatchObject({ kind: "account_balance", label: "Current balance" });
        expect(sumBankBalances([bank, savings, wallet])).toEqual({ total: 600, currencyCode: undefined });
    });
});

describe("accountTypeCaption", () => {
    it("maps each account type to its caption", () => {
        expect(accountTypeCaption("bank")).toBe("Bank account");
        expect(accountTypeCaption("credit_card")).toBe("Credit card");
        expect(accountTypeCaption("cash")).toBe("Cash");
        expect(accountTypeCaption("savings")).toBe("Savings");
    });

    it("captions the unknown type as Account", () => {
        expect(accountTypeCaption("unknown")).toBe("Account");
    });
});
