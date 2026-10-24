import type { ISystemInfo } from "@badger/types";
import { formatTimeAgo } from "./relativeTime";

/** First 7 characters of the build's git SHA; null when the build has no commit. */
export function shortCommit(commit: string | null): string | null {
    return commit ? commit.slice(0, 7) : null;
}

/**
 * The About card's status line when no update is available. Dev and unknown builds are never compared with releases,
 * so they get no "up to date" claim; null when there is nothing to say.
 */
export function updateStatusLabel(info: ISystemInfo): string | null {
    if (!info.updateCheckEnabled || info.updateAvailable) return null;
    if (!info.updateComparable) return "Development build: update notices are off";
    return info.checkedAt ? "You're up to date" : null;
}

/** The About card's "Last checked" line: checks disabled, never checked, or how long ago the last check ran. */
export function lastCheckedLabel(info: ISystemInfo, now: Date = new Date()): string {
    if (!info.updateCheckEnabled) return "Update checks are disabled on this instance";
    if (!info.checkedAt) return "Not checked yet";
    return `Checked ${formatTimeAgo(info.checkedAt, now)}`;
}
