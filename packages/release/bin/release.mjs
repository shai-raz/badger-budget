#!/usr/bin/env node
/**
 * Releases everything user-facing since the last `v*` tag: bumps the package versions, updates the changelog
 * and writes the GitHub release notes. Git, GitHub and filesystem access live here; every decision is made by
 * the pure modules in `../src`.
 *
 *   --repo owner/name   GitHub repository (default: $GITHUB_REPOSITORY)
 *   --dry-run           report what would be released without touching files
 *   --render-only       regenerate CHANGELOG.md from apps/api/changelog.json and stop
 *   --notes-file path   where to write the release notes (default: $RUNNER_TEMP or the OS temp dir)
 *   --root dir          repository root (default: resolved from this script's location)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyBump, decideBump, parseTag } from "../src/bump.mjs";
import { prependRelease, renderChangelogMarkdown, renderReleaseNotes } from "../src/changelog.mjs";
import { isReleaseCommit, parseTitle, stripPrSuffix } from "../src/conventional.mjs";
import { setPackageVersion } from "../src/package-version.mjs";
import { pickPr } from "../src/pick-pr.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TAG_PATTERN = "v[0-9]*.[0-9]*.[0-9]*";
const FIELD = "\x1f";
const RECORD = "\x1e";
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const CHANGELOG_JSON = "apps/api/changelog.json";
const CHANGELOG_MD = "CHANGELOG.md";
const VERSION_FILES = ["package.json", "apps/api/package.json", "apps/web/package.json"];

/**
 * @typedef {{ repo: string | undefined, dryRun: boolean, renderOnly: boolean, notesFile: string, root: string }} Options
 */

/**
 * @param {string[]} argv
 * @returns {Options}
 */
function parseArgs(argv) {
    /** @type {Options} */
    const options = {
        repo: process.env.GITHUB_REPOSITORY,
        dryRun: false,
        renderOnly: false,
        notesFile: path.join(process.env.RUNNER_TEMP || os.tmpdir(), "release-notes.md"),
        root: DEFAULT_ROOT,
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        const value = () => {
            const next = argv[++index];
            if (next === undefined) {
                throw new Error(`${arg} needs a value`);
            }
            return next;
        };
        if (arg === "--repo") {
            options.repo = value();
        } else if (arg === "--dry-run") {
            options.dryRun = true;
        } else if (arg === "--render-only") {
            options.renderOnly = true;
        } else if (arg === "--notes-file") {
            options.notesFile = path.resolve(value());
        } else if (arg === "--root") {
            options.root = path.resolve(value());
        } else {
            throw new Error(`Unknown argument ${arg}`);
        }
    }
    if (options.repo === undefined || !REPO_RE.test(options.repo)) {
        throw new Error("Pass --repo owner/name or set GITHUB_REPOSITORY");
    }
    return options;
}

/**
 * @param {string} root
 * @param {string[]} args
 * @returns {string}
 */
function git(root, args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * @param {string} root
 * @returns {string}
 */
function lastReleaseTag(root) {
    let tag;
    try {
        tag = git(root, ["describe", "--tags", "--abbrev=0", `--match=${TAG_PATTERN}`, "HEAD"]).trim();
    } catch {
        throw new Error("No v*.*.* tag is reachable from HEAD; create the previous release tag first");
    }
    if (parseTag(tag) === null) {
        throw new Error(`Last tag "${tag}" is not a vX.Y.Z release tag`);
    }
    return tag;
}

/**
 * First-parent commits since the tag, oldest first.
 * @param {string} root
 * @param {string} tag
 * @returns {{ sha: string, subject: string, body: string }[]}
 */
function commitsSince(root, tag) {
    const output = git(root, ["log", "--first-parent", "--format=%H%x1f%s%x1f%b%x1e", `${tag}..HEAD`]);
    return output
        .split(RECORD)
        .map((record) => record.trim())
        .filter((record) => record !== "")
        .map((record) => {
            const [sha, subject, body = ""] = record.split(FIELD);
            return { sha: sha.trim(), subject: subject.trim(), body };
        })
        .reverse();
}

/**
 * Looks up the pull request a commit landed through. Falls back to the commit subject when the API is unavailable.
 * @param {string} repo
 * @param {string} sha
 * @param {string | undefined} token
 * @returns {Promise<{ number: number, title: string } | null>}
 */
async function lookupPull(repo, sha, token) {
    if (!token) {
        return null;
    }
    try {
        const response = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/pulls`, {
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${token}`,
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub responded ${response.status}`);
        }
        return pickPr(sha, await response.json());
    } catch (error) {
        console.warn(`warning: could not look up the PR for ${sha.slice(0, 7)}: ${error.message}`);
        return null;
    }
}

/**
 * @param {Options} options
 * @param {string} tag
 * @returns {Promise<{ items: import("../src/changelog.mjs").ChangelogItem[], lines: string[] }>}
 */
async function collectItems(options, tag) {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    /** @type {import("../src/changelog.mjs").ChangelogItem[]} */
    const items = [];
    const lines = [];
    for (const commit of commitsSince(options.root, tag)) {
        const shortSha = commit.sha.slice(0, 7);
        if (isReleaseCommit(commit.subject)) {
            lines.push(`  ${shortSha} skipped (release commit)`);
            continue;
        }
        const pull = await lookupPull(options.repo, commit.sha, token);
        const title = pull?.title ?? commit.subject;
        const pr = pull?.number ?? stripPrSuffix(commit.subject).pr;
        const parsed = parseTitle(stripPrSuffix(title).subject, commit.body);
        if (parsed === null) {
            lines.push(`  ${shortSha} skipped (not a conventional title): ${title}`);
            continue;
        }
        items.push({ ...parsed, pr });
        const prLabel = pr === null ? "" : ` #${pr}`;
        lines.push(`  ${shortSha} ${parsed.type}${parsed.breaking ? "!" : ""}${prLabel}: ${parsed.subject}`);
    }
    return { items, lines };
}

/**
 * @param {string} root
 * @returns {import("../src/changelog.mjs").Changelog}
 */
function readChangelog(root) {
    return JSON.parse(fs.readFileSync(path.join(root, CHANGELOG_JSON), "utf8"));
}

/**
 * @param {string} root
 * @param {string} repo
 * @param {import("../src/changelog.mjs").Changelog} changelog
 */
function writeChangelogMarkdown(root, repo, changelog) {
    fs.writeFileSync(path.join(root, CHANGELOG_MD), renderChangelogMarkdown(changelog, repo));
}

/**
 * Appends key=value lines to the GitHub Actions output file, when running in Actions.
 * @param {Record<string, string>} outputs
 */
function writeGithubOutputs(outputs) {
    if (!process.env.GITHUB_OUTPUT) {
        return;
    }
    const text = Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join("");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, text);
}

/**
 * @param {Options} options
 */
async function main(options) {
    if (options.renderOnly) {
        writeChangelogMarkdown(options.root, options.repo, readChangelog(options.root));
        console.log(`Rendered ${CHANGELOG_MD} from ${CHANGELOG_JSON}.`);
        return;
    }

    const tag = lastReleaseTag(options.root);
    const base = parseTag(tag);
    console.log(`Last release tag: ${tag}`);

    const { items, lines } = await collectItems(options, tag);
    console.log("Commits since the tag:");
    console.log(lines.length > 0 ? lines.join("\n") : "  (none)");

    const bump = decideBump(items);
    if (bump === null) {
        console.log(`No user-facing changes since ${tag}; nothing to release.`);
        if (!options.dryRun) {
            writeGithubOutputs({ released: "false" });
        }
        return;
    }

    const version = applyBump(base, bump);
    const date = new Date().toISOString().slice(0, 10);
    const release = { version, date, items };
    console.log(`Bump: ${bump} → next version ${version} (${date}).`);

    if (options.dryRun) {
        console.log("Dry run: no files were changed.");
        return;
    }

    const changelog = prependRelease(readChangelog(options.root), release);
    fs.writeFileSync(path.join(options.root, CHANGELOG_JSON), JSON.stringify(changelog, null, 4) + "\n");
    writeChangelogMarkdown(options.root, options.repo, changelog);
    for (const file of VERSION_FILES) {
        const target = path.join(options.root, file);
        fs.writeFileSync(target, setPackageVersion(fs.readFileSync(target, "utf8"), version));
    }
    fs.writeFileSync(options.notesFile, renderReleaseNotes(release, options.repo));
    console.log(`Updated ${[CHANGELOG_JSON, CHANGELOG_MD, ...VERSION_FILES].join(", ")}.`);
    console.log(`Release notes written to ${options.notesFile}.`);

    writeGithubOutputs({ released: "true", version, notes_file: options.notesFile });
}

main(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(`release: ${error.message}`);
    process.exitCode = 1;
});
