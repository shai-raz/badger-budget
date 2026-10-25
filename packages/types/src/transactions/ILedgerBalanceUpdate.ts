import type { IAccountResponse } from "./IAccountResponse";

export interface IUpdateLedgerBalance {
    /** The cash amount the user actually has on hand now. */
    amount: number;
    /** The user's local calendar day, YYYY-MM-DD. */
    date: string;
}

export interface ILedgerBalanceUpdateResponse {
    account: IAccountResponse;
    /** The transaction recorded for the difference, or null when the balance already matched. */
    adjustment: { id: string; type: "expense" | "transfer"; amount: number } | null;
}
