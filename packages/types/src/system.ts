/** GET /api/v1/system/info and POST /api/v1/system/check-updates. */
export interface ISystemInfo {
    /** e.g. "0.3.1", "0.3.1-3-gabc1234", "0.3.0-dev"; null when unknown. */
    version: string | null;
    /** Full git SHA from the build; null for builds without GIT_SHA. */
    commit: string | null;
    /** Latest release version without the leading v, e.g. "0.4.0". */
    latest: string | null;
    updateAvailable: boolean;
    /** False for -dev and unknown builds, which never get update notices. */
    updateComparable: boolean;
    /** ISO time of the last successful check. */
    checkedAt: string | null;
    updateCheckEnabled: boolean;
    /** html_url of the latest release. */
    releaseUrl: string | null;
}

/** One entry of a release in the bundled changelog (apps/api/changelog.json). */
export type ChangelogItemType = "feat" | "fix" | "perf";

export interface IChangelogItem {
    type: ChangelogItemType | string;
    scope: string | null;
    breaking: boolean;
    subject: string;
    /** Link to the merged PR; null when the commit had no PR number. */
    prUrl: string | null;
}

export interface IChangelogRelease {
    /** X.Y.Z without the leading v. */
    version: string;
    /** YYYY-MM-DD. */
    date: string;
    summary: string | null;
    items: IChangelogItem[];
    /** True for releases newer than the user's lastSeenVersion (never for a user who has not been stamped yet). */
    unseen: boolean;
}

/** GET /api/v1/system/changelog: releases the running build has reached, newest first. */
export interface IChangelogResponse {
    /** Base X.Y.Z of the running build; null when unknown. */
    currentVersion: string | null;
    lastSeenVersion: string | null;
    /** True when the user was last seen on an older release than the running build. */
    showOnStart: boolean;
    releases: IChangelogRelease[];
}

/** POST /api/v1/system/changelog/seen. */
export interface IChangelogSeenResponse {
    lastSeenVersion: string | null;
}
