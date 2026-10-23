#!/usr/bin/env node
/**
 * Fails unless the pull request title in `PR_TITLE` is a Conventional Commit title.
 * The title comes from the environment, never from argv, so it is never shell-interpolated.
 */
import { parseTitle, TYPES } from "../src/conventional.mjs";

const title = process.env.PR_TITLE ?? "";
const parsed = parseTitle(title);

if (!parsed) {
    console.error(`PR title "${title}" is not a Conventional Commit title.`);
    console.error("");
    console.error("Expected format: type(scope)?!?: subject");
    console.error(`Allowed types: ${TYPES.join(", ")}`);
    console.error("");
    console.error("Examples:");
    console.error("  feat(web): show the running version");
    console.error("  fix: handle an empty changelog");
    console.error("  feat(api)!: drop the legacy endpoint");
    process.exit(1);
}

const breaking = parsed.breaking ? ", breaking" : "";
console.log(`PR title is valid: type "${parsed.type}"${breaking}.`);
