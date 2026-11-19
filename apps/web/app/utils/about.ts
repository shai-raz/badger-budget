import type { ISystemInfo } from "@badger/types";
import { formatTimeAgo } from "./relativeTime";
import type { UpgradePhase } from "./upgradeTracking";

/** First 7 characters of the build's git SHA; null when the build has no commit. */
export function shortCommit(commit: string | null): string | null {
    return commit ? commit.slice(0, 7) : null;
}

/**
 * The About page's status line when no update is available. Dev and unknown builds are never compared with releases,
 * so they get no "up to date" claim; null when there is nothing to say.
 */
export function updateStatusLabel(info: ISystemInfo): string | null {
    if (!info.updateCheckEnabled || info.updateAvailable) return null;
    if (!info.updateComparable) return "Development build: update notices are off";
    return info.checkedAt ? "You're up to date" : null;
}

export type AboutStatusKind =
    | "up-to-date"
    | "update-upgradeable"
    | "update"
    | "upgrading"
    | "checks-off"
    | "dev-build"
    | "not-checked";

export interface AboutStatus {
    kind: AboutStatusKind;
    headline: string;
    detail: string | null;
}

/** The About page's status band: what the server knows about updates, and what an in-flight upgrade is doing. */
export function aboutStatus(
    info: ISystemInfo,
    phase: UpgradePhase | null,
    targetVersion: string | null,
    now: Date = new Date(),
): AboutStatus {
    if (phase === "upgrading") {
        const target = targetVersion ?? info.latest;
        return {
            kind: "upgrading",
            headline: target ? `Upgrading to ${target}…` : "Upgrading…",
            detail: "The app restarts and may be unavailable for a minute.",
        };
    }
    if (!info.updateCheckEnabled) {
        return {
            kind: "checks-off",
            headline: "Update checks are off",
            detail: "This server doesn't look for new versions.",
        };
    }
    if (!info.updateComparable) {
        return {
            kind: "dev-build",
            headline: "Development build",
            detail: `${info.version ?? "This build"} isn't compared with releases, so there are no update notices.`,
        };
    }
    const ago = info.checkedAt ? formatTimeAgo(info.checkedAt, now) : null;
    if (info.updateAvailable && info.upgradeAvailable) {
        return {
            kind: "update-upgradeable",
            headline: `Version ${info.latest} is available`,
            detail: `You have ${info.version}${ago ? ` · checked ${ago}` : ""}`,
        };
    }
    if (info.updateAvailable) {
        return {
            kind: "update",
            headline: `Version ${info.latest} is available`,
            detail: `You have ${info.version}. Whoever runs this Badger server can update it.`,
        };
    }
    if (!info.checkedAt) return { kind: "not-checked", headline: "Not checked yet", detail: null };
    return { kind: "up-to-date", headline: "You're up to date", detail: `Checked ${ago}` };
}

/** The main Settings page's About row: the version line, and whether the row shows the update dot and tag. */
export function aboutRowSubtitle(info: ISystemInfo): { subtitle: string; update: boolean } {
    const v = info.version ?? "unknown";
    if (!info.updateCheckEnabled || !info.updateComparable) return { subtitle: `Version ${v}`, update: false };
    if (info.updateAvailable) {
        return { subtitle: `Version ${info.latest} is available · you have ${v}`, update: true };
    }
    if (info.checkedAt) return { subtitle: `Version ${v} · Up to date`, update: false };
    return { subtitle: `Version ${v}`, update: false };
}
