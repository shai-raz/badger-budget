/**
 * Rewrites the version field of a package.json without reformatting the rest of the file.
 */

/** A `"version": "..."` property at the start of a line. Group 1 is the indent, 2 the separator, 3 the value. */
const VERSION_LINE_RE = /^([ \t]*)"version"([ \t]*:[ \t]*)"[^"\n]*"/gm;

/**
 * Replaces the top-level version. The top-level property is the least-indented match, so nested
 * `"version"` keys (for example inside dependency objects) are left alone.
 * @param {string} text package.json contents
 * @param {string} version new `X.Y.Z` version
 * @returns {string}
 */
export function setPackageVersion(text, version) {
    /** @type {RegExpExecArray | null} */
    let target = null;
    for (const match of text.matchAll(VERSION_LINE_RE)) {
        if (target === null || match[1].length < target[1].length) {
            target = match;
        }
    }
    if (target === null) {
        throw new Error('No top-level "version" field found');
    }
    const replacement = `${target[1]}"version"${target[2]}"${version}"`;
    return text.slice(0, target.index) + replacement + text.slice(target.index + target[0].length);
}
