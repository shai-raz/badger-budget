// Error codes recorded on a failed bank sync. The API classifies each failure into one of these;
// the web maps them to user-facing messages. Adding a code = a name here + its web message.

/** Codes the IBS scraper reports for a failed company login or scrape. */
export const IBS_ERROR_CODES = [
    "INVALID_PASSWORD",
    "CHANGE_PASSWORD",
    "ACCOUNT_BLOCKED",
    "TIMEOUT",
    "TWO_FACTOR_RETRIEVER_MISSING",
    "GENERIC",
    "GENERAL_ERROR",
] as const;
export type IbsErrorCode = (typeof IBS_ERROR_CODES)[number];

/** Every code a sync or scraper job can end with. */
export const SYNC_ERROR_CODES = [
    ...IBS_ERROR_CODES,
    "CREDENTIALS_UNREADABLE",
    "IMPORT_FAILED",
    "SYNC_START_FAILED",
    "INTERRUPTED",
    "UNKNOWN",
] as const;
export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

export function isIbsErrorCode(value: unknown): value is IbsErrorCode {
    return typeof value === "string" && (IBS_ERROR_CODES as readonly string[]).includes(value);
}

/** Credential failures are never retried: repeating bad credentials risks locking the account. */
export const CREDENTIAL_ERROR_CODES = [
    "INVALID_PASSWORD",
    "CHANGE_PASSWORD",
    "ACCOUNT_BLOCKED",
] as const satisfies readonly IbsErrorCode[];
export type CredentialErrorCode = (typeof CREDENTIAL_ERROR_CODES)[number];

export function isCredentialErrorCode(value: unknown): value is CredentialErrorCode {
    return typeof value === "string" && (CREDENTIAL_ERROR_CODES as readonly string[]).includes(value);
}

export function isSyncErrorCode(value: unknown): value is SyncErrorCode {
    return typeof value === "string" && (SYNC_ERROR_CODES as readonly string[]).includes(value);
}

/** Narrows a stored column: null stays null, an unknown string reads as UNKNOWN. */
export function parseSyncErrorCode(raw: string | null | undefined): SyncErrorCode | null {
    if (raw === null || raw === undefined) return null;
    return isSyncErrorCode(raw) ? raw : "UNKNOWN";
}

/** Message of the 401 the API returns for a wrong sync PIN (the api-client must not treat it as an expired session). */
export const INVALID_PIN_MESSAGE = "Invalid PIN";
