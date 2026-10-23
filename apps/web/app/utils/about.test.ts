import { describe, expect, it } from "vitest";
import type { ISystemInfo } from "@badger/types";
import { lastCheckedLabel, shortCommit } from "./about";

const baseInfo: ISystemInfo = {
    version: "0.3.1",
    commit: "abc1234def5678901234567890abcdef12345678",
    latest: null,
    updateAvailable: false,
    checkedAt: null,
    updateCheckEnabled: true,
    releaseUrl: null,
};

describe("shortCommit", () => {
    it("keeps the first 7 characters of a full SHA", () => {
        expect(shortCommit("abc1234def5678901234567890abcdef12345678")).toBe("abc1234");
    });

    it("is null when the build has no commit", () => {
        expect(shortCommit(null)).toBeNull();
        expect(shortCommit("")).toBeNull();
    });
});

describe("lastCheckedLabel", () => {
    const now = new Date("2026-10-23T12:00:00.000Z");

    it("says checks are disabled when the instance opted out, even if a check ran earlier", () => {
        expect(
            lastCheckedLabel({ ...baseInfo, updateCheckEnabled: false, checkedAt: "2026-10-23T11:00:00.000Z" }, now),
        ).toBe("Update checks are disabled on this instance");
    });

    it("says not checked yet when no successful check has run", () => {
        expect(lastCheckedLabel(baseInfo, now)).toBe("Not checked yet");
    });

    it("reports how long ago the last check ran", () => {
        expect(lastCheckedLabel({ ...baseInfo, checkedAt: "2026-10-23T09:00:00.000Z" }, now)).toBe(
            "Checked 3 hours ago",
        );
    });

    it("reads just now for a check run within the last minute", () => {
        expect(lastCheckedLabel({ ...baseInfo, checkedAt: "2026-10-23T11:59:30.000Z" }, now)).toBe("Checked just now");
    });
});
