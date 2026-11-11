import {
    autoSyncRunTokenTtlMs,
    autoSyncRunsPerDay,
    autoSyncWindowLengthMinutes,
    isAutoSyncDurationAllowed,
    isAutoSyncDurationDays,
    isAutoSyncIntervalUnit,
    isCredentialErrorCode,
} from "@badger/shared-data";

describe("auto-sync constants", () => {
    describe("guards", () => {
        it("accepts only the listed durations", () => {
            expect(isAutoSyncDurationDays(7)).toBe(true);
            expect(isAutoSyncDurationDays(30)).toBe(true);
            expect(isAutoSyncDurationDays(90)).toBe(true);
            expect(isAutoSyncDurationDays(14)).toBe(false);
            expect(isAutoSyncDurationDays("30")).toBe(false);
        });

        it("accepts only the listed interval units", () => {
            expect(isAutoSyncIntervalUnit("hours")).toBe(true);
            expect(isAutoSyncIntervalUnit("days")).toBe(true);
            expect(isAutoSyncIntervalUnit("weeks")).toBe(false);
            expect(isAutoSyncIntervalUnit(undefined)).toBe(false);
        });
    });

    describe("isAutoSyncDurationAllowed", () => {
        it("rejects a window shorter than two intervals", () => {
            expect(isAutoSyncDurationAllowed(7, "days", 5)).toBe(false);
        });

        it("allows a window of at least two intervals", () => {
            expect(isAutoSyncDurationAllowed(7, "days", 3)).toBe(true);
            expect(isAutoSyncDurationAllowed(7, "hours", 23)).toBe(true);
            expect(isAutoSyncDurationAllowed(30, "days", 7)).toBe(true);
        });
    });

    describe("autoSyncWindowLengthMinutes", () => {
        it("measures a window within the day", () => {
            expect(autoSyncWindowLengthMinutes(420, 1320)).toBe(900);
        });

        it("measures a window that wraps past midnight", () => {
            expect(autoSyncWindowLengthMinutes(1320, 120)).toBe(240);
        });

        it("returns 0 when start equals end", () => {
            expect(autoSyncWindowLengthMinutes(600, 600)).toBe(0);
        });
    });

    describe("autoSyncRunsPerDay", () => {
        it("counts both window ends for a 4-hour interval", () => {
            expect(autoSyncRunsPerDay(420, 1320, 4)).toBe(4);
        });

        it("counts every hour for a 1-hour interval", () => {
            expect(autoSyncRunsPerDay(420, 1320, 1)).toBe(16);
        });

        it("counts runs across midnight", () => {
            expect(autoSyncRunsPerDay(1320, 120, 2)).toBe(3);
        });
    });

    describe("autoSyncRunTokenTtlMs", () => {
        it("uses the interval when it is under the cap", () => {
            expect(autoSyncRunTokenTtlMs("hours", 1)).toBe(3_600_000);
        });

        it("caps the TTL at 6 hours", () => {
            expect(autoSyncRunTokenTtlMs("hours", 12)).toBe(21_600_000);
            expect(autoSyncRunTokenTtlMs("days", 1)).toBe(21_600_000);
        });
    });

    describe("isCredentialErrorCode", () => {
        it("accepts the credential error codes", () => {
            expect(isCredentialErrorCode("INVALID_PASSWORD")).toBe(true);
            expect(isCredentialErrorCode("CHANGE_PASSWORD")).toBe(true);
            expect(isCredentialErrorCode("ACCOUNT_BLOCKED")).toBe(true);
        });

        it("rejects other codes and non-strings", () => {
            expect(isCredentialErrorCode("TIMEOUT")).toBe(false);
            expect(isCredentialErrorCode("UNKNOWN")).toBe(false);
            expect(isCredentialErrorCode(undefined)).toBe(false);
        });
    });
});
