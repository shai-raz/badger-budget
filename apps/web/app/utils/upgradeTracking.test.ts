import { describe, expect, it } from "vitest";
import type { ISystemInfo } from "@badger/types";
import {
    PENDING_UPGRADE_KEY,
    UPGRADE_POLL_MS,
    closingStalledToastDismisses,
    UPGRADE_STALL_MS,
    parsePendingUpgrade,
    stalledToastIsStale,
    tabView,
    upgradeActionState,
    upgradeBadgeVisible,
    updateDialogMode,
    updateNavItem,
    upgradeNavLabel,
    upgradePhase,
    upgradePollInterval,
    versionReached,
    type PendingUpgrade,
    type UpgradePhase,
} from "./upgradeTracking";

const USER = "user-1";

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

    it("accepts a liveAt timestamp and keeps it", () => {
        const stamped = { ...pending, liveAt: pending.startedAt + 60_000 };
        expect(parsePendingUpgrade(stamped, "user-1")).toEqual(stamped);
    });

    it("omits liveAt when the entry has none", () => {
        expect(parsePendingUpgrade(pending, "user-1")).not.toHaveProperty("liveAt");
    });

    it("returns null for a mistyped liveAt", () => {
        expect(parsePendingUpgrade({ ...pending, liveAt: "later" }, "user-1")).toBeNull();
        expect(parsePendingUpgrade({ ...pending, liveAt: Number.NaN }, "user-1")).toBeNull();
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
        expect(upgradePhase(pending, runningAt("0.5.0"), buildA, later)).toBe("upgrading");
    });

    it("is ready when the target is live but this page still runs the old build", () => {
        expect(upgradePhase(pending, runningAt("0.6.0"), buildA, later)).toBe("ready");
    });

    it("is done when the page runs a new build", () => {
        expect(upgradePhase(pending, runningAt("0.6.0"), buildB, later)).toBe("done");
    });

    it("is done on a new build with a -N-g<sha> version that reaches the target", () => {
        expect(upgradePhase(pending, runningAt("0.6.0-2-gabc1234"), buildB, later)).toBe("done");
    });

    it("is stalled at exactly the stall threshold, and not one millisecond before", () => {
        const now = pending.startedAt + UPGRADE_STALL_MS;
        expect(upgradePhase(pending, runningAt("0.5.0"), buildA, now)).toBe("stalled");
        expect(upgradePhase(pending, runningAt("0.5.0"), buildA, now - 1)).toBe("upgrading");
    });

    it("is upgrading, not stalled, while the info has not loaded yet", () => {
        expect(upgradePhase(pending, null, buildA, later)).toBe("upgrading");
    });

    it("is still upgrading past the threshold while the info has not loaded", () => {
        const now = pending.startedAt + UPGRADE_STALL_MS;
        expect(upgradePhase(pending, null, buildA, now)).toBe("upgrading");
        expect(upgradePhase(pending, null, buildB, now)).toBe("upgrading");
    });

    describe("for a stamped entry", () => {
        const stamped = { ...pending, liveAt: pending.startedAt + 60_000 };
        const after = pending.startedAt + 3_600_000;

        it("is done on a new build at once, even before the info has loaded", () => {
            expect(upgradePhase(stamped, null, buildB, after)).toBe("done");
        });

        it("is ready on the old build without a reload, even before the info has loaded", () => {
            expect(upgradePhase(stamped, null, buildA, after)).toBe("ready");
        });

        it("is ready on the old build past the stall threshold, never stalled", () => {
            expect(upgradePhase(stamped, null, buildA, pending.startedAt + UPGRADE_STALL_MS)).toBe("ready");
        });

        it("is done on a new build even when the info still reports the old version", () => {
            expect(upgradePhase(stamped, runningAt("0.5.0"), buildB, after)).toBe("done");
        });
    });
});

describe("tabView", () => {
    const T = pending.startedAt;

    it("takes a copy of the entry only while it is ready on the build it started from", () => {
        const view = tabView(pending, null, runningAt("0.6.0"), "build-a", T + 60_000);
        expect(view.phase).toBe("ready");
        expect(view.held).toEqual({ ...pending, liveAt: T + 60_000 });
    });

    it("takes no copy of a stalled entry, so a dismissal in another tab still clears it", () => {
        const view = tabView(pending, null, runningAt("0.5.0"), "build-a", T + UPGRADE_STALL_MS);
        expect(view.phase).toBe("stalled");
        expect(view.held).toBeNull();
    });

    it("stamps liveAt once, the first time the target is seen live", () => {
        const first = tabView(pending, null, runningAt("0.6.0"), "build-a", T + 1_000);
        expect(first.stamp).toEqual({ ...pending, liveAt: T + 1_000 });
        const again = tabView(first.stamp, null, runningAt("0.6.0"), "build-a", T + 2_000);
        expect(again.stamp).toBeNull();
    });

    it("writes no stamp while the target is not live", () => {
        expect(tabView(pending, null, runningAt("0.5.0"), "build-a", T + 1_000).stamp).toBeNull();
        expect(tabView(pending, null, null, "build-a", T + 1_000).stamp).toBeNull();
    });

    it("reads its own copy once the shared entry is gone", () => {
        const copy = { ...pending, liveAt: T + 60_000 };
        const view = tabView(null, copy, null, "build-a", T + 120_000);
        expect(view.entry).toEqual(copy);
        expect(view.phase).toBe("ready");
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

/** What this browser keeps: the shared entry as its localStorage string, and the done toasts it has shown. */
interface Browser {
    raw: string | null;
    toasts: string[];
}

/** One open tab: the build it runs, the info it has loaded, and the copy of the entry it holds. */
interface Tab {
    buildId: string;
    info: ISystemInfo | null;
    held: PendingUpgrade | null;
}

const browserWith = (entry: PendingUpgrade | null): Browser => ({
    raw: entry === null ? null : JSON.stringify(entry),
    toasts: [],
});

/** A page load: a new page starts with no copy of the entry. */
const openTab = (buildId: string, info: ISystemInfo | null = null): Tab => ({ buildId, info, held: null });

/** Trigger in any tab: replaces the shared entry with a fresh, unstamped one. */
const trigger = (browser: Browser, startedAt: number, targetVersion: string | null = "0.6.0") => {
    browser.raw = JSON.stringify({ ...pending, startedAt, targetVersion });
};

/** One tab's update, the way the composable runs it: keep its copy, write the live stamp, claim the done toast. */
function sync(browser: Browser, tab: Tab, now: number): UpgradePhase | null {
    const view = tabView(parsePendingUpgrade(browser.raw, USER), tab.held, tab.info, tab.buildId, now);
    tab.held = view.held;
    if (view.stamp) browser.raw = JSON.stringify(view.stamp);
    if (view.done) {
        browser.toasts.push(view.done.version ? `Upgraded to v${view.done.version}` : "Upgrade complete");
        browser.raw = null;
    }
    return view.phase;
}

const minutes = (n: number) => n * 60_000;

describe("upgrade sequences across tabs and reloads", () => {
    const T = pending.startedAt;

    it("single tab: upgrading, ready, reload to done with one toast, then cleared", () => {
        const browser = browserWith(pending);
        const tab = openTab("build-a", runningAt("0.5.0"));
        expect(sync(browser, tab, T + 1_000)).toBe("upgrading");

        tab.info = runningAt("0.6.0");
        expect(sync(browser, tab, T + 20_000)).toBe("ready");
        expect(parsePendingUpgrade(browser.raw, USER)).toEqual({ ...pending, liveAt: T + 20_000 });

        // Reload lands on the new build before /system/info answers: done at once, no upgrading flash.
        expect(sync(browser, openTab("build-b"), T + 25_000)).toBe("done");
        expect(browser.toasts).toEqual(["Upgraded to v0.6.0"]);
        expect(browser.raw).toBeNull();

        expect(sync(browser, openTab("build-b", runningAt("0.6.0")), T + 30_000)).toBeNull();
        expect(browser.toasts).toHaveLength(1);
    });

    it("two tabs: the first reload finishes the upgrade, the other keeps Reload until it reloads", () => {
        const browser = browserWith(pending);
        const a = openTab("build-a", runningAt("0.6.0"));
        const b = openTab("build-a", runningAt("0.6.0"));
        expect(sync(browser, a, T + 20_000)).toBe("ready");
        expect(sync(browser, b, T + 21_000)).toBe("ready");

        expect(sync(browser, openTab("build-b"), T + 30_000)).toBe("done");
        expect(browser.toasts).toEqual(["Upgraded to v0.6.0"]);

        // B is still on the old build: its own copy keeps Reload available after the shared entry is gone.
        expect(sync(browser, b, T + 40_000)).toBe("ready");

        expect(sync(browser, openTab("build-b", runningAt("0.6.0")), T + 50_000)).toBeNull();
        expect(browser.toasts).toHaveLength(1);
    });

    it("a new tab after completion finds nothing to track and announces nothing", () => {
        const browser = browserWith(null);
        expect(sync(browser, openTab("build-b", runningAt("0.6.0")), T + 60_000)).toBeNull();
        expect(browser.toasts).toEqual([]);
    });

    it("a stalled upgrade re-triggered in another tab goes back to upgrading, then finishes", () => {
        const browser = browserWith(pending);
        const a = openTab("build-a", runningAt("0.5.0"));
        expect(sync(browser, a, T + minutes(10))).toBe("stalled");

        trigger(browser, T + minutes(11));
        expect(sync(browser, a, T + minutes(11) + 1_000)).toBe("upgrading");

        a.info = runningAt("0.6.0");
        expect(sync(browser, a, T + minutes(12))).toBe("ready");
        expect(sync(browser, openTab("build-b"), T + minutes(13))).toBe("done");
        expect(browser.toasts).toEqual(["Upgraded to v0.6.0"]);
    });

    it("dismissing the stalled toast clears the upgrade for every tab", () => {
        const browser = browserWith(pending);
        const a = openTab("build-a", runningAt("0.5.0"));
        expect(sync(browser, a, T + minutes(10))).toBe("stalled");

        expect(
            closingStalledToastDismisses({ kind: "stalled", startedAt: T }, parsePendingUpgrade(browser.raw, USER)),
        ).toBe(true);
        browser.raw = null;

        expect(sync(browser, openTab("build-a", runningAt("0.5.0")), T + minutes(11))).toBeNull();
    });

    it("a load more than 10 minutes in, with info not loaded, is upgrading rather than stalled", () => {
        const browser = browserWith(pending);
        const late = openTab("build-a");
        expect(sync(browser, late, T + minutes(20))).toBe("upgrading");

        late.info = runningAt("0.5.0");
        expect(sync(browser, late, T + minutes(20))).toBe("stalled");

        late.info = runningAt("0.6.0");
        expect(sync(browser, late, T + minutes(21))).toBe("ready");
    });

    it("a -N-g<sha> version reaches the target and the done toast names that version", () => {
        const browser = browserWith(pending);
        expect(sync(browser, openTab("build-a", runningAt("0.6.0-2-gabc1234")), T + minutes(1))).toBe("ready");
        expect(sync(browser, openTab("build-b", runningAt("0.6.0-2-gabc1234")), T + minutes(2))).toBe("done");
        expect(browser.toasts).toEqual(["Upgraded to v0.6.0-2-gabc1234"]);
    });

    it("with no target version, the upgrade is done once the version moves, and a reload without info says so", () => {
        const browser = browserWith({ ...pending, targetVersion: null });
        const a = openTab("build-a", runningAt("0.5.0"));
        expect(sync(browser, a, T + minutes(1))).toBe("upgrading");

        a.info = runningAt("0.6.0");
        expect(sync(browser, a, T + minutes(2))).toBe("ready");

        expect(sync(browser, openTab("build-b"), T + minutes(3))).toBe("done");
        expect(browser.toasts).toEqual(["Upgrade complete"]);
    });

    it("a stamped entry survives the localStorage round trip, so a reloaded old page reads ready without info", () => {
        const stamped = { ...pending, liveAt: T + minutes(1) };
        const browser = browserWith(stamped);
        expect(parsePendingUpgrade(browser.raw, USER)).toEqual(stamped);
        expect(sync(browser, openTab("build-a"), T + minutes(30))).toBe("ready");
    });
});

describe("stalledToastIsStale", () => {
    it("is stale once a stalled upgrade re-triggers in another tab", () => {
        expect(stalledToastIsStale("stalled", "upgrading")).toBe(true);
    });

    it("is stale when a stalled upgrade finishes or is cleared", () => {
        expect(stalledToastIsStale("stalled", "done")).toBe(true);
        expect(stalledToastIsStale("stalled", "ready")).toBe(true);
        expect(stalledToastIsStale("stalled", null)).toBe(true);
    });

    it("is not stale while the phase stays stalled, or when it was never stalled", () => {
        expect(stalledToastIsStale("stalled", "stalled")).toBe(false);
        expect(stalledToastIsStale("upgrading", "stalled")).toBe(false);
        expect(stalledToastIsStale(undefined, "upgrading")).toBe(false);
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
