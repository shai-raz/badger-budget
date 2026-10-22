/**
 * Conventional Commit title parsing shared by the PR-title check and the release tooling.
 */

/** Commit types that a conventional title may use. */
export const TYPES = ["feat", "fix", "perf", "refactor", "docs", "chore", "ci", "build", "test", "style", "revert"];

/** Matches `type(scope)!: subject`. Group 1 is the type, 3 the scope, 4 the `!`, 5 the subject. */
export const TITLE_RE = /^(feat|fix|perf|refactor|docs|chore|ci|build|test|style|revert)(\(([^)]+)\))?(!)?: (.+)$/;

const BREAKING_BODY_RE = /^BREAKING[ -]CHANGE:/m;
const PR_SUFFIX_RE = /\s\(#(\d+)\)$/;

/**
 * @typedef {{ type: string, scope: string | null, breaking: boolean, subject: string }} ParsedTitle
 */

/**
 * Parses a conventional title. A `!` after the type/scope or a `BREAKING CHANGE:` footer in the body marks a breaking change.
 * @param {string} title
 * @param {string} [body]
 * @returns {ParsedTitle | null}
 */
export function parseTitle(title, body = "") {
    const match = TITLE_RE.exec(title.trim());
    if (!match) {
        return null;
    }
    const [, type, , scope, bang, subject] = match;
    return {
        type,
        // Same normalisation as the subject: Prettier collapses whitespace inside the rendered `**scope:**` too.
        scope: normaliseWhitespace(scope) || null,
        breaking: bang === "!" || BREAKING_BODY_RE.test(body),
        // Collapse whitespace runs: Prettier does so inside Markdown paragraphs, which would break the CHANGELOG.md fixed point.
        subject: normaliseWhitespace(subject),
    };
}

/**
 * @param {string | undefined} text
 * @returns {string}
 */
function normaliseWhitespace(text) {
    return (text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Removes the trailing ` (#123)` that GitHub appends to squash-merged subjects.
 * @param {string} subject
 * @returns {{ subject: string, pr: number | null }}
 */
export function stripPrSuffix(subject) {
    const match = PR_SUFFIX_RE.exec(subject);
    if (!match) {
        return { subject, pr: null };
    }
    return { subject: subject.slice(0, match.index), pr: Number(match[1]) };
}

/**
 * True for the commits the release workflow itself pushes to main.
 * @param {string} subject
 * @returns {boolean}
 */
export function isReleaseCommit(subject) {
    return subject.startsWith("chore(release):");
}
