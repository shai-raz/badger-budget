// Guards the worker that `nuxt build` / `nuxt generate` emit (sw.js, from pwa.workbox in nuxt.config.ts) and the
// push worker it imports. A broken worker would otherwise ship silently, so both build scripts run this afterwards.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SW_PUSH = "sw-push.js";

/**
 * A fragment the minified worker must contain. `test` is a substring or a regex.
 * @typedef {{ name: string, test: string | RegExp }} Marker
 */

/** @type {Marker[]} */
const MARKERS = [
    { name: 'importScripts("sw-push.js")', test: /importScripts\(\s*["']sw-push\.js["']\s*\)/ },
    { name: "a precache entry for sw-push.js", test: /url:\s*["']sw-push\.js["']/ },
    { name: "skipWaiting()", test: "skipWaiting()" },
    { name: "clientsClaim()", test: "clientsClaim()" },
    { name: "a NavigationRoute", test: "NavigationRoute" },
    { name: 'createHandlerBoundToURL("/")', test: /createHandlerBoundToURL\(\s*["']\/["']\s*\)/ },
    { name: "the navigation denylist ^\\/api\\/", test: "^\\/api\\/" },
    { name: "the navigation denylist ^\\/oauth\\/", test: "^\\/oauth\\/" },
    { name: "the navigation denylist ^\\/\\.well-known\\/", test: "^\\/\\.well-known\\/" },
];

// Only emitted when the build prerenders index.html (`nuxt generate`); `nuxt build` has no static shell to precache.
const INDEX_PRECACHE = /url:\s*["'](?:\/|index\.html)["']/;

/**
 * @param {string} swSource
 * @param {string | RegExp} test
 * @returns {boolean}
 */
function matches(swSource, test) {
    return typeof test === "string" ? swSource.includes(test) : test.test(swSource);
}

/**
 * Lists what is wrong with the generated worker. An empty list means it passes.
 * @param {string} swSource contents of the generated sw.js
 * @param {string[]} publicFiles file names in the public output directory
 * @returns {string[]}
 */
export function findSwOutputProblems(swSource, publicFiles) {
    const problems = [];
    for (const marker of MARKERS) {
        if (!matches(swSource, marker.test)) problems.push(`sw.js is missing ${marker.name}`);
    }
    if (!publicFiles.includes(SW_PUSH)) {
        problems.push(`${SW_PUSH} is missing from the public output, so importScripts would fail at runtime`);
    }
    if (publicFiles.includes("index.html") && !matches(swSource, INDEX_PRECACHE)) {
        problems.push("sw.js does not precache index.html, the navigation fallback target");
    }
    return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const dir = resolve(APP_DIR, process.argv[2] ?? ".output/public");
    const swSource = readFileSync(join(dir, "sw.js"), "utf8");
    const problems = findSwOutputProblems(swSource, readdirSync(dir));
    if (problems.length > 0) {
        for (const problem of problems) console.error(`sw.js output check: ${problem}`);
        process.exit(1);
    }
    console.log("sw.js output check passed");
}
