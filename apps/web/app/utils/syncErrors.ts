// User-facing copy for a failed bank sync, keyed by the error code the API records.
import { isSyncErrorCode } from "@badger/shared-data";
import type { SyncErrorCode } from "@badger/shared-data";

/** What the user can do next: fix the login, or run the sync again. `null` means nothing to press. */
export type SyncErrorAction = "update-login" | "retry";

export const SYNC_ERROR_ACTION_LABEL: Record<SyncErrorAction, string> = {
    "update-login": "Update login",
    retry: "Retry",
};

export interface SyncErrorCopy {
    /** One line, at most 40 characters, no full stop. */
    short: string;
    /** What happened, then what to do. */
    explain: string;
    action: SyncErrorAction | null;
}

const SOMETHING_WENT_WRONG: SyncErrorCopy = {
    short: "Something went wrong",
    explain: "The sync failed without a clear reason. Try again in a few minutes.",
    action: "retry",
};

/** Total over every sync error code, so a new code fails to compile until it has copy. */
export const SYNC_ERROR_COPY: Record<SyncErrorCode, SyncErrorCopy> = {
    INVALID_PASSWORD: {
        short: "Wrong username or password",
        explain: "The bank rejected the login details. Update the login, then sync again.",
        action: "update-login",
    },
    CHANGE_PASSWORD: {
        short: "The bank wants a new password",
        explain: "The bank requires a new password before it syncs. Change it at the bank, then update the login here.",
        action: "update-login",
    },
    ACCOUNT_BLOCKED: {
        short: "The bank blocked online access",
        explain: "The bank has blocked online access to this account. Contact the bank to unblock it, then sync again.",
        action: null,
    },
    TIMEOUT: {
        short: "The bank's site didn't respond",
        explain: "The bank's website took too long to answer. Try again in a few minutes.",
        action: "retry",
    },
    TWO_FACTOR_RETRIEVER_MISSING: {
        short: "Needs a one-time code",
        explain: "The bank asked for a one-time code, which Badger can't enter yet.",
        action: null,
    },
    GENERIC: SOMETHING_WENT_WRONG,
    GENERAL_ERROR: SOMETHING_WENT_WRONG,
    UNKNOWN: SOMETHING_WENT_WRONG,
    IMPORT_FAILED: {
        short: "Couldn't save the transactions",
        explain: "Badger fetched the transactions but couldn't save them. Try again.",
        action: "retry",
    },
    SYNC_START_FAILED: {
        short: "Couldn't start the sync",
        explain: "Badger couldn't start the sync, so no bank was reached. Try again.",
        action: "retry",
    },
    INTERRUPTED: {
        short: "The server restarted during the sync",
        explain: "The server restarted while this sync was running, so it stopped. Sync again.",
        action: "retry",
    },
    CREDENTIALS_UNREADABLE: {
        short: "Saved login can't be read",
        explain:
            "The saved login can't be unlocked with your current sync PIN, usually because the PIN changed. Enter the login again.",
        action: "update-login",
    },
};

/**
 * Copy for a sync error code. A missing code (no error recorded) reads as UNKNOWN, and so does a code
 * this build doesn't know: a cached PWA bundle can run against a newer API that has added one.
 */
export function syncErrorCopy(code: string | null | undefined): SyncErrorCopy {
    return isSyncErrorCode(code) ? SYNC_ERROR_COPY[code] : SYNC_ERROR_COPY.UNKNOWN;
}
