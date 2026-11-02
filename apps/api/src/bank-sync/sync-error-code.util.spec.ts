import { syncErrorCodeOf, withSyncErrorCode } from "./sync-error-code.util";

describe("withSyncErrorCode", () => {
    it("tags the same Error instance and keeps its message", () => {
        const original = new Error("db down");
        const tagged = withSyncErrorCode(original, "IMPORT_FAILED");

        expect(tagged).toBe(original);
        expect(tagged.errorCode).toBe("IMPORT_FAILED");
        expect(tagged.message).toBe("db down");
    });

    it("wraps a non-Error value in an Error carrying the code", () => {
        const tagged = withSyncErrorCode("boom", "CREDENTIALS_UNREADABLE");

        expect(tagged).toBeInstanceOf(Error);
        expect(tagged.message).toBe("boom");
        expect(tagged.errorCode).toBe("CREDENTIALS_UNREADABLE");
    });
});

describe("syncErrorCodeOf", () => {
    it("prefers an explicit errorCode tag over an IBS errorType", () => {
        const err = Object.assign(new Error("x"), { errorType: "INVALID_PASSWORD" });
        expect(syncErrorCodeOf(withSyncErrorCode(err, "SYNC_START_FAILED"))).toBe("SYNC_START_FAILED");
    });

    it("reads an IBS errorType", () => {
        expect(syncErrorCodeOf(Object.assign(new Error("Scraper failed"), { errorType: "TIMEOUT" }))).toBe("TIMEOUT");
    });

    it("reads as UNKNOWN an errorType that is not an IBS code", () => {
        expect(syncErrorCodeOf(Object.assign(new Error("x"), { errorType: "SOMETHING_NEW" }))).toBe("UNKNOWN");
    });

    it("reads as UNKNOWN a plain Error", () => {
        expect(syncErrorCodeOf(new Error("plain"))).toBe("UNKNOWN");
    });

    it.each([["a string"], [42], [null], [undefined]])("reads as UNKNOWN the non-Error value %j", (value) => {
        expect(syncErrorCodeOf(value)).toBe("UNKNOWN");
    });
});
