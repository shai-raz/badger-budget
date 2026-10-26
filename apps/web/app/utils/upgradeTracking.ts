import type { ISystemInfo } from "@badger/types";
import { NAV_ACTIONS } from "./navigation";

/** localStorage key for the upgrade this browser triggered. Per-browser convenience only; the server stays the source of truth. */
export const PENDING_UPGRADE_KEY = "pendingUpgrade";
export const UPGRADE_POLL_MS = 5_000;
export const UPGRADE_STALL_MS = 10 * 60_000;

/** What this browser remembers about an upgrade it triggered, so it can track it across reloads. */
export interface PendingUpgrade {
    userId: string;
    /** Latest release version without the leading v; null when the host did not report one. */
    targetVersion: string | null;
    /** Running version when the upgrade was triggered. */
    fromVersion: string | null;
    /** Nuxt build id of the page that triggered the upgrade. */
    fromBuildId: string;
    startedAt: number;
    /** Set by the first tab that sees the target version live, so a page reloaded from ready reads its phase without waiting for /system/info. */
    liveAt?: number;
}

export type UpgradePhase = "upgrading" | "ready" | "stalled" | "done";
export type UpgradeActionState = "hidden" | "enabled" | "disabled";

/** Base X.Y.Z of a version string; `:latest` builds report `X.Y.Z-N-g<sha>`. */
function baseOf(version: string): [number, number, number] | null {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the stored upgrade when it is well formed and belongs to `userId`; anything else is null. */
export function parsePendingUpgrade(raw: unknown, userId: string | null): PendingUpgrade | null {
    if (userId === null) return null;

    let value: unknown = raw;
    if (typeof raw === "string") {
        try {
            value = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    if (!isRecord(value)) return null;

    const { userId: storedUserId, targetVersion, fromVersion, fromBuildId, startedAt, liveAt } = value;
    if (storedUserId !== userId) return null;
    if (targetVersion !== null && typeof targetVersion !== "string") return null;
    if (fromVersion !== null && typeof fromVersion !== "string") return null;
    if (typeof fromBuildId !== "string") return null;
    if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return null;
    if (liveAt !== undefined && (typeof liveAt !== "number" || !Number.isFinite(liveAt))) return null;

    const parsed: PendingUpgrade = { userId, targetVersion, fromVersion, fromBuildId, startedAt };
    if (liveAt !== undefined) parsed.liveAt = liveAt;
    return parsed;
}

/** True when the running version has reached the upgrade target (or moved off the version it started from, without a target). */
export function versionReached(p: PendingUpgrade, running: string | null): boolean {
    if (running === null) return false;
    if (p.targetVersion !== null) {
        const runningBase = baseOf(running);
        const targetBase = baseOf(p.targetVersion);
        if (!runningBase || !targetBase) return false;
        const [rMajor, rMinor, rPatch] = runningBase;
        const [tMajor, tMinor, tPatch] = targetBase;
        if (rMajor !== tMajor) return rMajor > tMajor;
        if (rMinor !== tMinor) return rMinor > tMinor;
        return rPatch >= tPatch;
    }
    return running !== p.fromVersion;
}

/**
 * Where the upgrade stands for this browser. Once the target has been seen live (stamped as `liveAt` by any tab, or
 * live in `info`), no `info` is needed: a page on the build that started the upgrade is ready, any other build is
 * done. `info` null before it loads is never stalled, so a slow or failed /system/info cannot flip a finished
 * upgrade to stalled.
 */
export function upgradePhase(p: PendingUpgrade, info: ISystemInfo | null, buildId: string, now: number): UpgradePhase {
    if (p.liveAt !== undefined || versionReached(p, info?.version ?? null)) {
        return buildId !== p.fromBuildId ? "done" : "ready";
    }
    if (info === null) return "upgrading";
    return now - p.startedAt >= UPGRADE_STALL_MS ? "stalled" : "upgrading";
}

/** One tab's view of the upgrade, derived from the shared entry, the copy this tab holds, and its own build and info. */
export interface UpgradeTabView {
    /** The phase this tab shows, or null when nothing is tracked. */
    phase: UpgradePhase | null;
    /** The entry the phase reads: the shared one, or this tab's copy once another tab cleared the shared entry. */
    entry: PendingUpgrade | null;
    /** This tab's copy to keep: taken while the upgrade is ready on the build it started from, never while stalled. */
    held: PendingUpgrade | null;
    /** The shared entry stamped with `liveAt`, once this tab sees the target live; null when there is nothing to write. */
    stamp: PendingUpgrade | null;
    /** Set in the first tab that sees the upgrade finish: announce it with `version`, then clear the shared entry. */
    done: { version: string | null } | null;
}

/**
 * Derives a tab's view. The composable writes `stamp` back to the shared entry and clears it on `done`; the tests
 * replay those writes over this function to walk the matrix across tabs and reloads.
 */
export function tabView(
    shared: PendingUpgrade | null,
    held: PendingUpgrade | null,
    info: ISystemInfo | null,
    buildId: string,
    now: number,
): UpgradeTabView {
    const reached = shared !== null && shared.liveAt === undefined && versionReached(shared, info?.version ?? null);
    const live = shared && reached ? { ...shared, liveAt: now } : shared;
    const entry = live ?? held;
    const phase = entry ? upgradePhase(entry, info, buildId, now) : null;
    return {
        phase,
        entry,
        held: live && phase === "ready" ? live : held,
        stamp: reached && live ? live : null,
        done: live && phase === "done" ? { version: info?.version ?? live.targetVersion } : null,
    };
}

/**
 * Closing a stalled toast dismisses the tracked upgrade only when that toast was raised for the upgrade still
 * tracked, so a stale toast left from an earlier attempt cannot wipe a newer one.
 */
export function closingStalledToastDismisses(
    data: { kind?: string; startedAt?: number } | undefined,
    p: PendingUpgrade | null,
): boolean {
    return data?.kind === "stalled" && p !== null && data.startedAt === p.startedAt;
}

/** The stalled toast is stale once the phase leaves stalled, e.g. another tab re-triggered or this one reloaded. */
export function stalledToastIsStale(
    prev: UpgradePhase | null | undefined,
    next: UpgradePhase | null | undefined,
): boolean {
    return prev === "stalled" && next !== "stalled";
}

/** The Upgrade action exists only when the host has a webhook and an update is out; it is disabled while the upgrade runs. */
export function upgradeActionState(info: ISystemInfo | null, phase: UpgradePhase | null): UpgradeActionState {
    if (info?.upgradeAvailable !== true || info.updateAvailable !== true) return "hidden";
    return phase === "upgrading" ? "disabled" : "enabled";
}

/** How often to poll /system/info while an upgrade is in flight. */
export function upgradePollInterval(phase: UpgradePhase | null): number | false {
    return phase === "upgrading" || phase === "stalled" ? UPGRADE_POLL_MS : false;
}

/** Navigation item label for the upgrade states. */
export function upgradeNavLabel(phase: Exclude<UpgradePhase, "done">, targetVersion: string | null): string {
    switch (phase) {
        case "upgrading":
            return targetVersion ? `Upgrading to v${targetVersion}…` : "Upgrading…";
        case "ready":
            return targetVersion ? `Reload to v${targetVersion}` : "Reload to the new version";
        case "stalled":
            return "Upgrade stalled";
    }
}

export type UpdateDialogMode = "normal" | "confirm" | "upgrading";

/** What the update dialog body shows. The confirm step is reachable only while the Upgrade action is enabled. */
export function updateDialogMode(
    info: ISystemInfo | null,
    phase: UpgradePhase | null,
    confirming: boolean,
): UpdateDialogMode {
    if (phase === "upgrading") return "upgrading";
    if (confirming && upgradeActionState(info, phase) === "enabled") return "confirm";
    return "normal";
}

/** The update badge and nav item show for a pending release, or for any upgrade that has not finished. */
export function upgradeBadgeVisible(visible: boolean, phase: UpgradePhase | null): boolean {
    return visible || (phase !== null && phase !== "done");
}

export interface UpdateNavItem {
    show: boolean;
    label: string;
    icon: string;
    /** `warn` marks a stalled upgrade; everything else uses the primary colour. */
    tone: "primary" | "warn";
    /** `reload` loads the new build straight away; `dialog` opens UpdateDialog. */
    action: "dialog" | "reload";
}

/** The sidebar and drawer update item: its visibility, label, icon and what a click does, for every upgrade phase. */
export function updateNavItem(
    visible: boolean,
    phase: UpgradePhase | null,
    targetVersion: string | null,
): UpdateNavItem {
    const show = upgradeBadgeVisible(visible, phase);
    if (phase === null || phase === "done") {
        return {
            show,
            label: NAV_ACTIONS.update.label,
            icon: NAV_ACTIONS.update.icon,
            tone: "primary",
            action: "dialog",
        };
    }
    const icon = { upgrading: "pi pi-spin pi-spinner", ready: "pi pi-refresh", stalled: "pi pi-exclamation-triangle" };
    return {
        show,
        label: upgradeNavLabel(phase, targetVersion),
        icon: icon[phase],
        tone: phase === "stalled" ? "warn" : "primary",
        action: phase === "ready" ? "reload" : "dialog",
    };
}
