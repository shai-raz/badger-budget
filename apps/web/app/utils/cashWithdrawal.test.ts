import type { IAccountResponse } from "@badger/types";
import { describe, expect, it } from "vitest";
import { matchesCashWithdrawal, pickCashWallet } from "./cashWithdrawal";

const patterns = [{ matchField: "additionalDescription" as const, text: "משיכת מזומן" }];

describe("matchesCashWithdrawal", () => {
    it("matches additionalDescription containing the text", () => {
        expect(
            matchesCashWithdrawal({ description: "ATM", additionalDescription: "משיכת מזומן 12:30" }, patterns),
        ).toBe(true);
    });

    it("does not match cheque or bank-account withdrawals", () => {
        expect(matchesCashWithdrawal({ description: "x", additionalDescription: "משיכת שיק" }, patterns)).toBe(false);
        expect(matchesCashWithdrawal({ description: "x", additionalDescription: "משיכה לחשבון הבנק" }, patterns)).toBe(
            false,
        );
    });

    it("only looks at the field the pattern targets", () => {
        const tx = { description: "משיכת מזומן", additionalDescription: null };
        expect(matchesCashWithdrawal(tx, patterns)).toBe(false);
        expect(matchesCashWithdrawal(tx, [{ matchField: "description", text: "משיכת מזומן" }])).toBe(true);
    });

    it("handles null fields and no patterns", () => {
        expect(matchesCashWithdrawal({ description: "a", additionalDescription: null }, patterns)).toBe(false);
        expect(matchesCashWithdrawal({ description: "משיכת מזומן", additionalDescription: "משיכת מזומן" }, [])).toBe(
            false,
        );
    });
});

const wallet = (over: Partial<IAccountResponse>): IAccountResponse =>
    ({
        id: "w",
        name: "Cash",
        type: "cash",
        currencyId: "ILS",
        lastTransactionDate: null,
        ...over,
    }) as IAccountResponse;

describe("pickCashWallet", () => {
    it("prefers the most recently used wallet, nulls last, then name", () => {
        const accounts = [
            wallet({ id: "b", name: "B" }),
            wallet({ id: "a", name: "A" }),
            wallet({ id: "old", name: "Old", lastTransactionDate: new Date("2026-01-01") }),
            wallet({ id: "new", name: "New", lastTransactionDate: new Date("2026-03-01") }),
        ];
        expect(pickCashWallet(accounts, "ILS")?.id).toBe("new");
        expect(
            pickCashWallet(
                accounts.filter((a) => a.id === "b" || a.id === "a"),
                "ILS",
            )?.id,
        ).toBe("a");
    });

    it("ignores wallets in another currency and non-cash accounts", () => {
        const accounts = [wallet({ id: "usd", currencyId: "USD" }), wallet({ id: "bank", type: "bank" })];
        expect(pickCashWallet(accounts, "ILS")).toBeNull();
        expect(pickCashWallet(accounts, "USD")?.id).toBe("usd");
    });

    it("returns null when there are no accounts", () => {
        expect(pickCashWallet([], "ILS")).toBeNull();
    });
});
