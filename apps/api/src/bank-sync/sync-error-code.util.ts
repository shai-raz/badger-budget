import { isIbsErrorCode, isSyncErrorCode, type SyncErrorCode } from "@badger/shared-data";

/** Tags an error with our own code; returns the same Error (or wraps a non-Error). */
export function withSyncErrorCode(err: unknown, code: SyncErrorCode): Error & { errorCode: SyncErrorCode } {
    const error = err instanceof Error ? err : new Error(String(err));
    return Object.assign(error, { errorCode: code });
}

/** Explicit errorCode tag > IBS errorType > UNKNOWN. */
export function syncErrorCodeOf(err: unknown): SyncErrorCode {
    if (typeof err !== "object" || err === null) return "UNKNOWN";
    const { errorCode, errorType } = err as { errorCode?: unknown; errorType?: unknown };
    if (isSyncErrorCode(errorCode)) return errorCode;
    if (isIbsErrorCode(errorType)) return errorType;
    return "UNKNOWN";
}
