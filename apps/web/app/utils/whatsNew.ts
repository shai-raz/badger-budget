import type { IChangelogItem, IChangelogRelease, IChangelogResponse } from "@badger/types";

export type WhatsNewStartAction = "mark-silently" | "open" | "none";
export type WhatsNewMode = "unseen" | "recent";

/**
 * What to do when the app loads. A user who has never been stamped (new account, or first deploy of this feature)
 * gets no popup, just the stamp. Otherwise the dialog opens only when the running build is newer than the stored
 * version and has release notes the user has not seen.
 */
export function whatsNewStartAction(data: IChangelogResponse): WhatsNewStartAction {
    if (!data.currentVersion) return "none";
    if (data.lastSeenVersion === null) return "mark-silently";
    if (!data.showOnStart) return "none";
    return data.releases.some((release) => release.unseen) ? "open" : "mark-silently";
}

/** The dialog lists either the releases the user has not seen yet, or the most recent ones on a manual open. */
export function releasesForMode(data: IChangelogResponse, mode: WhatsNewMode, limit = 10): IChangelogRelease[] {
    if (mode === "unseen") return data.releases.filter((release) => release.unseen);
    return data.releases.slice(0, limit);
}

/** Short tag shown before each change. Breaking changes read as such whatever their commit type. */
export function typeLabel(item: IChangelogItem): string {
    if (item.breaking) return "Breaking";
    switch (item.type) {
        case "feat":
            return "New";
        case "fix":
            return "Fixed";
        case "perf":
            return "Faster";
        default:
            return "Update";
    }
}
