import { SYNC_ERROR_CODES } from "@badger/shared-data";
import type { SyncErrorCode } from "@badger/shared-data";
import { describe, expect, it } from "vitest";
import { SYNC_ERROR_ACTION, SYNC_ERROR_COPY, syncErrorCopy } from "./syncErrors";

describe("SYNC_ERROR_COPY", () => {
    it.each(SYNC_ERROR_CODES)("has copy for %s", (code) => {
        const copy = SYNC_ERROR_COPY[code];
        expect(copy.short.length).toBeGreaterThan(0);
        expect(copy.explain.length).toBeGreaterThan(0);
    });

    it.each(SYNC_ERROR_CODES)("keeps the short message for %s on one line", (code) => {
        const { short } = SYNC_ERROR_COPY[code];
        expect(short.length).toBeLessThanOrEqual(40);
        expect(short.endsWith(".")).toBe(false);
    });

    it("maps each code to its action", () => {
        const expected: Record<SyncErrorCode, string | null> = {
            INVALID_PASSWORD: "update-login",
            CHANGE_PASSWORD: "update-login",
            ACCOUNT_BLOCKED: null,
            TIMEOUT: "retry",
            TWO_FACTOR_RETRIEVER_MISSING: null,
            GENERIC: "retry",
            GENERAL_ERROR: "retry",
            IMPORT_FAILED: "retry",
            SYNC_START_FAILED: "retry",
            INTERRUPTED: "retry",
            CREDENTIALS_UNREADABLE: "update-login",
            UNKNOWN: "retry",
        };

        for (const code of SYNC_ERROR_CODES) {
            expect(SYNC_ERROR_COPY[code].action, code).toBe(expected[code]);
        }
    });

    it("gives the short messages from the spec", () => {
        expect(SYNC_ERROR_COPY.INVALID_PASSWORD.short).toBe("Wrong username or password");
        expect(SYNC_ERROR_COPY.TIMEOUT.short).toBe("The bank's site didn't respond");
        expect(SYNC_ERROR_COPY.GENERIC.short).toBe("Something went wrong");
        expect(SYNC_ERROR_COPY.GENERAL_ERROR.short).toBe("Something went wrong");
        expect(SYNC_ERROR_COPY.UNKNOWN.short).toBe("Something went wrong");
        expect(SYNC_ERROR_COPY.INTERRUPTED.short).toBe("The server restarted during the sync");
    });
});

describe("syncErrorCopy", () => {
    it("returns the copy for a known code", () => {
        expect(syncErrorCopy("ACCOUNT_BLOCKED")).toBe(SYNC_ERROR_COPY.ACCOUNT_BLOCKED);
    });

    it.each([null, undefined])("reads a missing code (%s) as UNKNOWN", (code) => {
        expect(syncErrorCopy(code)).toBe(SYNC_ERROR_COPY.UNKNOWN);
    });

    it("reads a code this build doesn't know as UNKNOWN instead of crashing", () => {
        const copy = syncErrorCopy("SOME_CODE_FROM_A_NEWER_API");
        expect(copy).toBe(SYNC_ERROR_COPY.UNKNOWN);
        expect(copy.short).toBe("Something went wrong");
    });
});

describe("SYNC_ERROR_ACTION", () => {
    // The strip and the run dialog both read this map, so the icon is set here once.
    it("gives Update login the key icon and Retry the refresh icon", () => {
        expect(SYNC_ERROR_ACTION["update-login"]).toEqual({ label: "Update login", icon: "pi pi-key" });
        expect(SYNC_ERROR_ACTION.retry).toEqual({ label: "Retry", icon: "pi pi-refresh" });
    });
});
