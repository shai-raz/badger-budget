/** Max length of a transaction's user notes (enforced by the API DTOs, mirrored in the web form). */
export const TRANSACTION_NOTES_MAX_LENGTH = 1000;
/** Max length of additionalDescription on create/update (DTO-only; bank/sheet imports are not capped). */
export const TRANSACTION_ADDITIONAL_DESCRIPTION_MAX_LENGTH = 150;

/** Description of the expense recorded when a cash balance is set below the computed one (cash spent but not tracked). */
export const CASH_SHORTFALL_DESCRIPTION = "Untracked cash spending";
/** Description of the transfer-in recorded when a cash balance is set above the computed one. */
export const CASH_SURPLUS_DESCRIPTION = "Cash adjustment";
/** Description of the transfer recorded when a savings balance is set above or below the computed one (in either direction). */
export const SAVINGS_ADJUSTMENT_DESCRIPTION = "Savings adjustment";

/**
 * Cal's additionalDescription for card cash withdrawals (ATM). Deliberately the full phrase: the shorter "משיכ"
 * would also match cheque and Bit/PayBox rows.
 */
export const CASH_WITHDRAWAL_LABEL = "משיכת מזומן";
