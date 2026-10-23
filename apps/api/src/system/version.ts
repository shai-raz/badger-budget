/** Parsed build version. `base` is the X.Y.Z the build is at or after; `kind` says how it relates to that tag. */
export type ParsedVersion = { base: [number, number, number]; kind: "release" | "ahead" | "dev" } | null;

const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;
// `git describe --tags` output: N commits after the X.Y.Z tag, at commit <hex>.
const AHEAD = /^(\d+)\.(\d+)\.(\d+)-\d+-g[0-9a-fA-F]+$/;
// Local build without a release tag.
const DEV = /^(\d+)\.(\d+)\.(\d+)-dev$/;

/** Strips surrounding whitespace and a leading `v` (APP_VERSION and release tag_name may carry it). */
export function normalizeVersion(v: string): string {
    return v.trim().replace(/^v/, "").trim();
}

/** Parses "X.Y.Z", "X.Y.Z-N-g<hex>" (git describe) or "X.Y.Z-dev". Anything else is null. */
export function parseVersion(v: string | null | undefined): ParsedVersion {
    if (v == null) return null;
    const s = normalizeVersion(v);
    const release = RELEASE.exec(s);
    if (release) return { base: toBase(release), kind: "release" };
    const ahead = AHEAD.exec(s);
    if (ahead) return { base: toBase(ahead), kind: "ahead" };
    const dev = DEV.exec(s);
    if (dev) return { base: toBase(dev), kind: "dev" };
    return null;
}

export function compareBase(a: [number, number, number], b: [number, number, number]): -1 | 0 | 1 {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return 0;
}

/** "X.Y.Z" for release, ahead and dev builds; null when unparsable. */
export function baseVersion(v: string | null | undefined): string | null {
    const parsed = parseVersion(v);
    return parsed ? parsed.base.join(".") : null;
}

/**
 * True only when a plain release newer than the running build's base is available. Dev and unknown builds never
 * report an update, and neither does a latest value that is not a plain release.
 */
export function isUpdateAvailable(running: string | null, latest: string | null): boolean {
    const runningParsed = parseVersion(running);
    if (!runningParsed || runningParsed.kind === "dev") return false;
    const latestParsed = parseVersion(latest);
    if (!latestParsed || latestParsed.kind !== "release") return false;
    return compareBase(latestParsed.base, runningParsed.base) > 0;
}

function toBase(match: RegExpExecArray): [number, number, number] {
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}
