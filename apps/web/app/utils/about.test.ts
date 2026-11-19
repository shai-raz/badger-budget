import { describe, expect, it } from "vitest";
import type { ISystemInfo } from "@badger/types";
import { aboutRowSubtitle, aboutStatus, shortCommit, updateStatusLabel } from "./about";

const baseInfo: ISystemInfo = {
    version: "0.3.1",
    commit: "abc1234def5678901234567890abcdef12345678",
    latest: null,
    updateAvailable: false,
    updateComparable: true,
    checkedAt: null,
    updateCheckEnabled: true,
    upgradeAvailable: false,
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

describe("updateStatusLabel", () => {
    it("says up to date for a comparable build that has checked", () => {
        expect(updateStatusLabel({ ...baseInfo, checkedAt: "2026-10-23T11:00:00.000Z" })).toBe("You're up to date");
    });

    it("says update notices are off for a dev build, never up to date", () => {
        expect(
            updateStatusLabel({
                ...baseInfo,
                version: "0.3.0-dev",
                updateComparable: false,
                checkedAt: "2026-10-23T11:00:00.000Z",
            }),
        ).toBe("Development build: update notices are off");
    });

    it("says nothing when the check is disabled or no check has succeeded yet", () => {
        expect(
            updateStatusLabel({ ...baseInfo, updateCheckEnabled: false, checkedAt: "2026-10-23T11:00:00.000Z" }),
        ).toBeNull();
        expect(updateStatusLabel(baseInfo)).toBeNull();
    });

    it("says nothing when an update is available", () => {
        expect(
            updateStatusLabel({ ...baseInfo, updateAvailable: true, checkedAt: "2026-10-23T11:00:00.000Z" }),
        ).toBeNull();
    });
});

describe("aboutStatus", () => {
    const now = new Date("2026-10-23T12:00:00.000Z");
    const checkedAt = "2026-10-23T11:00:00.000Z";
    const available = { ...baseInfo, latest: "0.4.0", updateAvailable: true, checkedAt };

    it("shows the upgrade target while an upgrade runs", () => {
        expect(aboutStatus(available, "upgrading", "0.4.0", now)).toEqual({
            kind: "upgrading",
            headline: "Upgrading to 0.4.0…",
            detail: "The app restarts and may be unavailable for a minute.",
        });
    });

    it("falls back to the latest version, then to a bare upgrading line, when no target is known", () => {
        expect(aboutStatus(available, "upgrading", null, now).headline).toBe("Upgrading to 0.4.0…");
        expect(aboutStatus(baseInfo, "upgrading", null, now).headline).toBe("Upgrading…");
    });

    it("says checks are off when the instance opted out", () => {
        expect(aboutStatus({ ...baseInfo, updateCheckEnabled: false, checkedAt }, null, null, now)).toEqual({
            kind: "checks-off",
            headline: "Update checks are off",
            detail: "This server doesn't look for new versions.",
        });
    });

    it("names the dev build and explains why there are no update notices", () => {
        expect(aboutStatus({ ...baseInfo, version: "0.3.0-dev", updateComparable: false }, null, null, now)).toEqual({
            kind: "dev-build",
            headline: "Development build",
            detail: "0.3.0-dev isn't compared with releases, so there are no update notices.",
        });
    });

    it("uses a fallback name for a dev build with an unknown version", () => {
        expect(aboutStatus({ ...baseInfo, version: null, updateComparable: false }, null, null, now).detail).toBe(
            "This build isn't compared with releases, so there are no update notices.",
        );
    });

    it("offers the upgrade with the check time when this server can upgrade", () => {
        expect(aboutStatus({ ...available, upgradeAvailable: true }, null, null, now)).toEqual({
            kind: "update-upgradeable",
            headline: "Version 0.4.0 is available",
            detail: "You have 0.3.1 · checked 1 hour ago",
        });
    });

    it("omits the check time when no check has succeeded and an upgrade is available", () => {
        expect(aboutStatus({ ...available, checkedAt: null, upgradeAvailable: true }, null, null, now).detail).toBe(
            "You have 0.3.1",
        );
    });

    it("tells a non-admin viewer who can update the server", () => {
        expect(aboutStatus({ ...available, upgradeAvailable: false }, null, null, now)).toEqual({
            kind: "update",
            headline: "Version 0.4.0 is available",
            detail: "You have 0.3.1. Whoever runs this Badger server can update it.",
        });
    });

    it("says not checked yet when no check has succeeded", () => {
        expect(aboutStatus(baseInfo, null, null, now)).toEqual({
            kind: "not-checked",
            headline: "Not checked yet",
            detail: null,
        });
    });

    it("says up to date with the time of the last check", () => {
        expect(aboutStatus({ ...baseInfo, checkedAt }, null, null, now)).toEqual({
            kind: "up-to-date",
            headline: "You're up to date",
            detail: "Checked 1 hour ago",
        });
    });

    it("ignores an upgrade phase other than upgrading", () => {
        expect(aboutStatus({ ...baseInfo, checkedAt }, "ready", null, now).kind).toBe("up-to-date");
    });
});

describe("aboutRowSubtitle", () => {
    const checkedAt = "2026-10-23T11:00:00.000Z";

    it("shows just the version when checks are off, even with an update on record", () => {
        expect(
            aboutRowSubtitle({ ...baseInfo, updateCheckEnabled: false, updateAvailable: true, latest: "0.4.0" }),
        ).toEqual({ subtitle: "Version 0.3.1", update: false });
    });

    it("shows just the version for a build that is not compared with releases", () => {
        expect(aboutRowSubtitle({ ...baseInfo, version: "0.3.0-dev", updateComparable: false })).toEqual({
            subtitle: "Version 0.3.0-dev",
            update: false,
        });
    });

    it("flags an available update and names both versions", () => {
        expect(aboutRowSubtitle({ ...baseInfo, updateAvailable: true, latest: "0.4.0" })).toEqual({
            subtitle: "Version 0.4.0 is available · you have 0.3.1",
            update: true,
        });
    });

    it("says up to date once a check has succeeded", () => {
        expect(aboutRowSubtitle({ ...baseInfo, checkedAt })).toEqual({
            subtitle: "Version 0.3.1 · Up to date",
            update: false,
        });
    });

    it("shows just the version before the first successful check", () => {
        expect(aboutRowSubtitle(baseInfo)).toEqual({ subtitle: "Version 0.3.1", update: false });
    });

    it("uses a fallback for an unknown version", () => {
        expect(aboutRowSubtitle({ ...baseInfo, version: null })).toEqual({
            subtitle: "Version unknown",
            update: false,
        });
    });
});
