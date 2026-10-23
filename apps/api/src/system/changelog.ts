import type { IChangelogRelease, IChangelogResponse, IChangelogItem } from "@badger/types";
import { compareBase, parseVersion } from "./version";

/** One entry as written in apps/api/changelog.json (the release workflow owns that file). */
export interface ChangelogSourceItem {
    type: string;
    scope: string | null;
    breaking: boolean;
    subject: string;
    pr: number | null;
}

export interface ChangelogSourceRelease {
    version: string;
    date: string;
    summary: string | null;
    items: ChangelogSourceItem[];
}

export interface ChangelogSource {
    releases: ChangelogSourceRelease[];
}

/** Item types that reach the app. Everything else (docs, chore, refactor, ...) is internal. Breaking changes always do. */
const USER_FACING_TYPES = new Set(["feat", "fix", "perf"]);

/**
 * Validates the parsed changelog.json. Returns null when the shape is wrong anywhere, so one bad entry hides the whole
 * file instead of showing a partial history.
 */
export function parseChangelogSource(raw: unknown): ChangelogSource | null {
    if (!isRecord(raw) || !Array.isArray(raw.releases)) return null;
    const releases: ChangelogSourceRelease[] = [];
    for (const release of raw.releases) {
        if (!isRecord(release) || typeof release.version !== "string" || typeof release.date !== "string") return null;
        if (release.summary != null && typeof release.summary !== "string") return null;
        if (!Array.isArray(release.items)) return null;
        const items: ChangelogSourceItem[] = [];
        for (const item of release.items) {
            if (!isRecord(item) || typeof item.type !== "string" || typeof item.subject !== "string") return null;
            items.push({
                type: item.type,
                scope: typeof item.scope === "string" ? item.scope : null,
                breaking: item.breaking === true,
                subject: item.subject,
                pr: typeof item.pr === "number" ? item.pr : null,
            });
        }
        const summary = typeof release.summary === "string" ? release.summary : null;
        releases.push({ version: release.version, date: release.date, summary, items });
    }
    return { releases };
}

/**
 * Keeps user-facing items only. A release with no user-facing items is dropped too, unless it has a summary of its
 * own (the 0.1.0 "initial release" entry).
 */
export function filterUserFacing(releases: ChangelogSourceRelease[]): ChangelogSourceRelease[] {
    return releases.flatMap((release) => {
        const items = release.items.filter((item) => item.breaking || USER_FACING_TYPES.has(item.type));
        if (items.length === 0 && !release.summary?.trim()) return [];
        return [{ ...release, items }];
    });
}

export interface ChangelogResponseInput {
    /** Filtered releases, newest first or in any order (sorted here). */
    releases: ChangelogSourceRelease[];
    /** Base X.Y.Z of the running build, or null when unknown. */
    currentVersion: string | null;
    lastSeenVersion: string | null;
    /** "owner/name", used for PR links. */
    repo: string;
}

/**
 * Builds GET /system/changelog. Only releases the running build has reached are returned, so a rollback does not show
 * notes for features that are not in the build. Versions are compared on their base X.Y.Z.
 */
export function buildChangelogResponse({
    releases,
    currentVersion,
    lastSeenVersion,
    repo,
}: ChangelogResponseInput): IChangelogResponse {
    const current = parseVersion(currentVersion)?.base ?? null;
    const seen = parseVersion(lastSeenVersion)?.base ?? null;

    const visible = filterUserFacing(releases)
        .map((release) => ({ release, base: parseVersion(release.version)?.base ?? null }))
        .filter((entry): entry is { release: ChangelogSourceRelease; base: [number, number, number] } => {
            if (entry.base === null) return false;
            return current === null || compareBase(entry.base, current) <= 0;
        })
        .sort((a, b) => compareBase(b.base, a.base));

    const mapped: IChangelogRelease[] = visible.map(({ release, base }) => ({
        version: release.version,
        date: release.date,
        summary: release.summary,
        items: release.items.map(toItem(repo)),
        unseen: current !== null && seen !== null && compareBase(base, seen) > 0,
    }));

    return {
        currentVersion: current ? current.join(".") : null,
        lastSeenVersion,
        showOnStart: current !== null && seen !== null && compareBase(current, seen) > 0,
        releases: mapped,
    };
}

/**
 * The version to store after the user has seen What's New. Only ever raises: a rollback to an older build keeps the
 * newer stamp, so the dialog does not reopen when the newer build returns.
 */
export function nextSeenVersion(current: string | null, lastSeen: string | null): string | null {
    const running = parseVersion(current);
    if (!running) return lastSeen;
    const runningText = running.base.join(".");
    const seen = parseVersion(lastSeen);
    if (!seen || compareBase(running.base, seen.base) > 0) return runningText;
    return lastSeen;
}

function toItem(repo: string): (item: ChangelogSourceItem) => IChangelogItem {
    return (item) => ({
        type: item.type,
        scope: item.scope,
        breaking: item.breaking,
        subject: item.subject,
        prUrl: item.pr != null ? `https://github.com/${repo}/pull/${item.pr}` : null,
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
