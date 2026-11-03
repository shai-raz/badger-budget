import {
    IBS_ERROR_CODES,
    SYNC_ERROR_CODES,
    isIbsErrorCode,
    isSyncErrorCode,
    parseSyncErrorCode,
} from "@badger/shared-data";

describe("sync error codes", () => {
    it("includes every IBS code in the sync code set", () => {
        for (const code of IBS_ERROR_CODES) {
            expect(SYNC_ERROR_CODES).toContain(code);
        }
    });

    it.each(SYNC_ERROR_CODES.map((code) => [code]))("accepts %s as a sync code", (code) => {
        expect(isSyncErrorCode(code)).toBe(true);
    });

    it.each([["CREDENTIALS_UNREADABLE"], ["INTERRUPTED"], ["SYNC_START_FAILED"]])(
        "does not treat the non-IBS code %s as an IBS code",
        (code) => {
            expect(isIbsErrorCode(code)).toBe(false);
        },
    );

    it.each([[null], [undefined], [42], ["invalid_password"], [""]])("rejects %j as a sync code", (value) => {
        expect(isSyncErrorCode(value)).toBe(false);
    });

    it("keeps a known stored code", () => {
        expect(parseSyncErrorCode("INVALID_PASSWORD")).toBe("INVALID_PASSWORD");
    });

    it("keeps null and undefined as null", () => {
        expect(parseSyncErrorCode(null)).toBeNull();
        expect(parseSyncErrorCode(undefined)).toBeNull();
    });

    it("reads an unknown stored string as UNKNOWN", () => {
        expect(parseSyncErrorCode("SOME_REMOVED_CODE")).toBe("UNKNOWN");
    });
});
