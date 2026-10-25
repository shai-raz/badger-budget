import { describe, expect, it } from "vitest";
import type { ISystemInfo } from "@badger/types";
import {
    PENDING_UPGRADE_KEY,
    UPGRADE_POLL_MS,
    closingStalledToastDismisses,
    UPGRADE_STALL_MS,
    parsePendingUpgrade,
    upgradeActionState,
    upgradeBadgeVisible,
    updateDialogMode,
    updateNavItem,
    upgradeNavLabel,
    upgradePhase,
    upgradePollInterval,
    versionReached,
    type PendingUpgrade,
} from "./upgradeTracking";

const pending: PendingUpgrade = {
    userId: "user-1",
    targetVersion: "0.6.0",
    fromVersion: "0.5.0",
    fromBuildId: "build-a",
    startedAt: 1_000_000,
};

const info: ISystemInfo = {
    version: "0.5.0",
    commit: null,
    latest: "0.6.0",
    updateAvailable: true,
    updateComparable: true,
    checkedAt: "2026-10-20T10:00:00Z",
    updateCheckEnabled: true,
    upgradeAvailable: true,
    releaseUrl: "https://github.com/shai-raz/badger-budget/releases/tag/v0.6.0",
};

const runningAt = (version: string | null): ISystemInfo => ({ ...info, version });

describe("PENDING_UPGRADE_KEY", () => {
    it("is the localStorage key the tracker uses", () => {
        expect(PENDING_UPGRADE_KEY).toBe("pendingUpgrade");
    });
});

describe("parsePendingUpgrade", () => {
    it("accepts a well-formed object", () => {
        expect(parsePendingUpgrade(pending, "user-1")).toEqual(pending);
    });

    it("accepts a JSON string", () => {
        expect(parsePendingUpgrade(JSON.stringify(pending), "user-1")).toEqual(pending);
    });

    it("accepts null target and from versions", () => {
        const unknown = { ...pending, targetVersion: null, fromVersion: null };
        expect(parsePendingUpgrade(unknown, "user-1")).toEqual(unknown);
    });

    it("returns null for bad JSON", () => {
        expect(parsePendingUpgrade("{not json", "user-1")).toBeNull();
    });

    it("returns null for values that are not objects", () => {
        expect(parsePendingUpgrade(null, "user-1")).toBeNull();
        expect(parsePendingUpgrade(undefined, "user-1")).toBeNull();
        expect(parsePendingUpgrade("42", "user-1")).toBeNull();
        expect(parsePendingUpgrade([pending], "user-1")).toBeNull();
    });

    it("returns null for missing or mistyped fields", () => {
        expect(parsePendingUpgrade({ ...pending, fromBuildId: undefined }, "user-1")).toBeNull();
        expect(parsePendingUpgrade({ ...pending, startedAt: "1000" }, "user-1")).toBeNull();
        expect(parsePendingUpgrade({ ...pending, startedAt: Number.NaN }, "user-1")).toBeNull();
        expect(parsePendingUpgrade({ ...pending, startedAt: Number.POSITIVE_INFINITY }, "user-1")).toBeNull();
        expect(parsePendingUpgrade({ ...pending, targetVersion: 6 }, "user-1")).toBeNull();
        expect(
            parsePendingUpgrade(
                { userId: "user-1", fromVersion: null, fromBuildId: "build-a", startedAt: 1 },
                "user-1",
            ),
        ).toBeNull();
    });

    it("ignores another user's state in the same browser", () => {
        expect(parsePendingUpgrade(pending, "user-2")).toBeNull();
    });

    it("returns null when there is no signed-in user", () => {
        expect(parsePendingUpgrade(pending, null)).toBeNull();
    });
});

describe("versionReached", () => {
    it("compares base versions so a :latest build still matches its release", () => {
        expect(versionReached(pending, "0.6.0-2-gabc1234")).toBe(true);
        expect(versionReached(pending, "0.6.0")).toBe(true);
    });

    it("is false for an older base version", () => {
        expect(versionReached(pending, "0.5.9")).toBe(false);
        expect(versionReached(pending, "0.5.0-3-gabc1234")).toBe(false);
    });

    it("is true for a newer base version than the target", () => {
        expect(versionReached(pending, "0.7.0")).toBe(true);
        expect(versionReached(pending, "1.0.0")).toBe(true);
    });

    it("treats an unparseable running version as not reached", () => {
        expect(versionReached(pending, "0.3.0-dev")).toBe(false);
        expect(versionReached(pending, "dev")).toBe(false);
    });

    it("is false when the running version is unknown", () => {
        expect(versionReached(pending, null)).toBe(false);
        expect(versionReached({ ...pending, targetVersion: null }, null)).toBe(false);
    });

    it("without a target, is true once the running version differs from the starting one", () => {
        const noTarget = { ...pending, targetVersion: null };
        expect(versionReached(noTarget, "0.6.0")).toBe(true);
        expect(versionReached(noTarget, "0.5.0")).toBe(false);
    });
});

describe("upgradePhase", () => {
    const buildA = "build-a";
    const buildB = "build-b";
    const later = pending.startedAt + 60_000;

    it("is upgrading while the running version is still old", () => {
        expect(upgradePhase(pending, runningAt("0.5.0"), buildA, later, false)).toBe("upgrading");
    });

    it("is ready when the target is live but this page still runs the old build", () => {
        expect(upgradePhase(pending, runningAt("0.6.0"), buildA, later, false)).toBe("ready");
    });

    it("is done when the page runs a new build", () => {
        expect(upgradePhase(pending, runningAt("0.6.0"), buildB, later, false)).toBe("done");
    });

    it("is done in the tab that reloaded for this upgrade, even on the same build id", () => {
        expect(upgradePhase(pending, runningAt("0.6.0"), buildA, later, true)).toBe("done");
    });

    it("stays ready in another tab on the same build id, which did not reload", () => {
        expect(upgradePhase(pending, runningAt("0.6.0"), buildA, later, false)).toBe("ready");
    });

    it("is stalled at exactly the stall threshold, and not one millisecond before", () => {
        const now = pending.startedAt + UPGRADE_STALL_MS;
        expect(upgradePhase(pending, runningAt("0.5.0"), buildA, now, false)).toBe("stalled");
        expect(upgradePhase(pending, runningAt("0.5.0"), buildA, now - 1, false)).toBe("upgrading");
    });

    it("is upgrading, not stalled, while the info has not loaded yet", () => {
        expect(upgradePhase(pending, null, buildA, later, false)).toBe("upgrading");
    });

    it("is still upgrading past the threshold while the info has not loaded, so a reloaded finished upgrade never flashes stalled", () => {
        const now = pending.startedAt + UPGRADE_STALL_MS;
        expect(upgradePhase(pending, null, buildA, now, true)).toBe("upgrading");
        expect(upgradePhase(pending, null, buildA, now, false)).toBe("upgrading");
    });
});

describe("closingStalledToastDismisses", () => {
    it("dismisses the upgrade when the stalled toast was raised for the tracked upgrade", () => {
        expect(closingStalledToastDismisses({ kind: "stalled", startedAt: pending.startedAt }, pending)).toBe(true);
    });

    it("leaves a newer upgrade alone when the toast belongs to an earlier attempt", () => {
        const newer = { ...pending, startedAt: pending.startedAt + 3_600_000 };
        expect(closingStalledToastDismisses({ kind: "stalled", startedAt: pending.startedAt }, newer)).toBe(false);
    });

    it("ignores ready and info toasts, and toasts without data", () => {
        expect(closingStalledToastDismisses({ kind: "ready", startedAt: pending.startedAt }, pending)).toBe(false);
        expect(closingStalledToastDismisses(undefined, pending)).toBe(false);
    });

    it("does nothing when no upgrade is tracked", () => {
        expect(closingStalledToastDismisses({ kind: "stalled", startedAt: pending.startedAt }, null)).toBe(false);
    });
});

describe("upgradeActionState", () => {
    it("is hidden unless the host has an upgrade webhook", () => {
        expect(upgradeActionState({ ...info, upgradeAvailable: false }, null)).toBe("hidden");
        const withoutFlag: Partial<ISystemInfo> = { ...info };
        delete withoutFlag.upgradeAvailable;
        expect(upgradeActionState(withoutFlag as ISystemInfo, null)).toBe("hidden");
    });

    it("is hidden when no update is available", () => {
        expect(upgradeActionState({ ...info, updateAvailable: false }, null)).toBe("hidden");
    });

    it("is hidden when the info has not loaded", () => {
        expect(upgradeActionState(null, null)).toBe("hidden");
        expect(upgradeActionState(null, "upgrading")).toBe("hidden");
    });

    it("is disabled while the upgrade is in progress", () => {
        expect(upgradeActionState(info, "upgrading")).toBe("disabled");
    });

    it("is enabled when idle or stalled", () => {
        expect(upgradeActionState(info, null)).toBe("enabled");
        expect(upgradeActionState(info, "stalled")).toBe("enabled");
    });
});

describe("upgradePollInterval", () => {
    it("polls while upgrading or stalled", () => {
        expect(upgradePollInterval("upgrading")).toBe(UPGRADE_POLL_MS);
        expect(upgradePollInterval("stalled")).toBe(UPGRADE_POLL_MS);
    });

    it("does not poll otherwise", () => {
        expect(upgradePollInterval("ready")).toBe(false);
        expect(upgradePollInterval("done")).toBe(false);
        expect(upgradePollInterval(null)).toBe(false);
    });
});

describe("upgradeNavLabel", () => {
    it("names the target version when known", () => {
        expect(upgradeNavLabel("upgrading", "0.6.0")).toBe("Upgrading to v0.6.0…");
        expect(upgradeNavLabel("ready", "0.6.0")).toBe("Reload to v0.6.0");
    });

    it("falls back to generic wording without a target", () => {
        expect(upgradeNavLabel("upgrading", null)).toBe("Upgrading…");
        expect(upgradeNavLabel("ready", null)).toBe("Reload to the new version");
    });

    it("labels the stalled state", () => {
        expect(upgradeNavLabel("stalled", "0.6.0")).toBe("Upgrade stalled");
    });
});

describe("updateDialogMode", () => {
    it("shows the normal body when idle", () => {
        expect(updateDialogMode(info, null, false)).toBe("normal");
    });

    it("shows the confirm step after Upgrade now, while the action is enabled", () => {
        expect(updateDialogMode(info, null, true)).toBe("confirm");
        expect(updateDialogMode(info, "stalled", true)).toBe("confirm");
    });

    it("shows the upgrading body while the upgrade runs, even with the confirm flag set", () => {
        expect(updateDialogMode(info, "upgrading", false)).toBe("upgrading");
        expect(updateDialogMode(info, "upgrading", true)).toBe("upgrading");
    });

    it("never enters the confirm step without an upgrade webhook", () => {
        const noWebhook = { ...info, upgradeAvailable: false };
        expect(upgradeActionState(noWebhook, null)).toBe("hidden");
        expect(updateDialogMode(noWebhook, null, true)).toBe("normal");
        expect(updateDialogMode(null, null, true)).toBe("normal");
    });

    it("never enters the confirm step when no update is available", () => {
        expect(updateDialogMode({ ...info, updateAvailable: false }, null, true)).toBe("normal");
    });
});

describe("upgradeBadgeVisible", () => {
    it("shows for a pending release, or for an upgrade that has not finished", () => {
        expect(upgradeBadgeVisible(true, null)).toBe(true);
        expect(upgradeBadgeVisible(false, "upgrading")).toBe(true);
        expect(upgradeBadgeVisible(false, "ready")).toBe(true);
        expect(upgradeBadgeVisible(false, "stalled")).toBe(true);
    });

    it("hides when nothing is pending and the upgrade is done or absent", () => {
        expect(upgradeBadgeVisible(false, null)).toBe(false);
        expect(upgradeBadgeVisible(false, "done")).toBe(false);
    });
});

describe("updateNavItem", () => {
    it("is the update item with its idle label and icon when no upgrade is tracked", () => {
        expect(updateNavItem(true, null, "0.6.0")).toEqual({
            show: true,
            label: "Update available",
            icon: "pi pi-arrow-circle-up",
            tone: "primary",
            action: "dialog",
        });
    });

    it("is hidden when no release is pending and no upgrade is tracked", () => {
        expect(updateNavItem(false, null, "0.6.0").show).toBe(false);
        expect(updateNavItem(false, "done", "0.6.0").show).toBe(false);
    });

    it("keeps the idle label after an upgrade is done while a release is still pending", () => {
        expect(updateNavItem(true, "done", "0.6.0")).toMatchObject({ show: true, label: "Update available" });
    });

    it("shows the upgrading item with a spinner and opens the dialog", () => {
        expect(updateNavItem(false, "upgrading", "0.6.0")).toEqual({
            show: true,
            label: "Upgrading to v0.6.0…",
            icon: "pi pi-spin pi-spinner",
            tone: "primary",
            action: "dialog",
        });
    });

    it("shows the ready item, which reloads directly", () => {
        expect(updateNavItem(false, "ready", "0.6.0")).toEqual({
            show: true,
            label: "Reload to v0.6.0",
            icon: "pi pi-refresh",
            tone: "primary",
            action: "reload",
        });
    });

    it("shows the stalled item in the warn tone, which opens the dialog", () => {
        expect(updateNavItem(false, "stalled", null)).toEqual({
            show: true,
            label: "Upgrade stalled",
            icon: "pi pi-exclamation-triangle",
            tone: "warn",
            action: "dialog",
        });
    });
});
