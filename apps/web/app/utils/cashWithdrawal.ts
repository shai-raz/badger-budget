import type { IAccountResponse, ICashWithdrawalPattern, ITransactionResponse } from "@badger/types";
import { matchString } from "@badger/utils";

/** True when any pattern's text is contained in the transaction field it targets. */
export function matchesCashWithdrawal(
    tx: Pick<ITransactionResponse, "description" | "additionalDescription">,
    patterns: Pick<ICashWithdrawalPattern, "matchField" | "text">[],
): boolean {
    return patterns.some((p) => matchString(tx[p.matchField] ?? "", "contains", p.text));
}

/** Wallet to prefill: cash accounts in currencyId, most recent lastTransactionDate first (nulls last, then name); null if none. */
export function pickCashWallet(accounts: IAccountResponse[], currencyId: string | null): IAccountResponse | null {
    const time = (a: IAccountResponse) => (a.lastTransactionDate ? new Date(a.lastTransactionDate).getTime() : null);
    const candidates = accounts
        .filter((a) => a.type === "cash" && a.currencyId === currencyId)
        .sort((a, b) => {
            const ta = time(a);
            const tb = time(b);
            if (ta !== tb) {
                if (ta === null) return 1;
                if (tb === null) return -1;
                return tb - ta;
            }
            return a.name.localeCompare(b.name);
        });
    return candidates[0] ?? null;
}
