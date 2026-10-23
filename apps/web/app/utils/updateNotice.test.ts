import { describe, expect, it } from "vitest";
import type { ISystemInfo } from "@badger/types";
import { hamburgerLabel, isUpdateNoticeVisible } from "./updateNotice";

const availableInfo: ISystemInfo = {
    version: "0.4.0",
    commit: null,
    latest: "0.5.0",
    updateAvailable: true,
    updateComparable: true,
    checkedAt: "2026-10-20T10:00:00Z",
    updateCheckEnabled: true,
    releaseUrl: "https://github.com/shai-raz/badger-budget/releases/tag/v0.5.0",
};

describe("isUpdateNoticeVisible", () => {
    it("is hidden before system info loads", () => {
        expect(isUpdateNoticeVisible(undefined, null)).toBe(false);
        expect(isUpdateNoticeVisible(null, null)).toBe(false);
    });

    it("is hidden when no update is available", () => {
        expect(isUpdateNoticeVisible({ ...availableInfo, updateAvailable: false, latest: "0.4.0" }, null)).toBe(false);
    });

    it("is hidden when the latest version is unknown", () => {
        expect(isUpdateNoticeVisible({ ...availableInfo, latest: null }, null)).toBe(false);
    });

    it("is visible for a newer release that has not been dismissed", () => {
        expect(isUpdateNoticeVisible(availableInfo, null)).toBe(true);
    });

    it("is hidden when the same version was dismissed", () => {
        expect(isUpdateNoticeVisible(availableInfo, "0.5.0")).toBe(false);
    });

    it("is visible again when a newer release arrives after a dismissal", () => {
        expect(isUpdateNoticeVisible({ ...availableInfo, latest: "0.6.0" }, "0.5.0")).toBe(true);
    });
});

describe("hamburgerLabel", () => {
    it("mentions the update only while the notice is visible", () => {
        expect(hamburgerLabel(true)).toBe("Open menu, update available");
        expect(hamburgerLabel(false)).toBe("Open menu");
    });
});
