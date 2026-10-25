/**
 * Semver bump decisions derived from parsed conventional commits.
 */

/** @typedef {"major" | "minor" | "patch"} Bump */

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const TAG_RE = /^v(\d+\.\d+\.\d+)$/;

/**
 * Picks the highest bump the entries call for: breaking → major, feat → minor, fix/perf → patch.
 * @param {{ type: string, breaking: boolean }[]} entries
 * @returns {Bump | null} null when nothing user-facing changed
 */
export function decideBump(entries) {
    let best = null;
    for (const { type, breaking } of entries) {
        /** @type {Bump | null} */
        let bump = null;
        if (breaking) {
            bump = "major";
        } else if (type === "feat") {
            bump = "minor";
        } else if (type === "fix" || type === "perf") {
            bump = "patch";
        }
        if (bump !== null && (best === null || rank(bump) > rank(best))) {
            best = bump;
        }
    }
    return best;
}

/**
 * Applies a bump to an `X.Y.Z` version. While the major is 0, a breaking change bumps the minor instead.
 * @param {string} version
 * @param {Bump | null} bump
 * @returns {string}
 */
export function applyBump(version, bump) {
    const match = SEMVER_RE.exec(version);
    if (!match) {
        throw new Error(`Cannot bump unparsable version "${version}"`);
    }
    if (bump === null) {
        return version;
    }
    let [major, minor, patch] = match.slice(1).map(Number);
    let effective = bump;
    if (major === 0 && effective === "major") {
        effective = "minor";
    }
    if (effective === "major") {
        return `${major + 1}.0.0`;
    }
    if (effective === "minor") {
        return `${major}.${minor + 1}.0`;
    }
    return `${major}.${minor}.${patch + 1}`;
}

/**
 * Extracts the version from a `vX.Y.Z` release tag.
 * @param {string} tag
 * @returns {string | null}
 */
export function parseTag(tag) {
    const match = TAG_RE.exec(tag);
    return match ? match[1] : null;
}

/**
 * @param {Bump} bump
 * @returns {number}
 */
function rank(bump) {
    if (bump === "major") {
        return 3;
    }
    if (bump === "minor") {
        return 2;
    }
    return 1;
}
