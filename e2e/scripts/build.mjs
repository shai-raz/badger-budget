// Builds the API and two web bundles for the E2E suite. Skipped entirely with E2E_SKIP_BUILD=1.
// Build A is copied out before build B so turbo's cache cannot replay A for B (B uses `pnpm --filter web generate`
// directly). Build B is left in apps/web/.output, which the upgrade scenario needs.
import { execSync } from "node:child_process";
import { cpSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.E2E_SKIP_BUILD === "1") {
    console.log("E2E_SKIP_BUILD=1: reusing the builds in e2e/.builds");
    process.exit(0);
}

const e2eDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = resolve(e2eDir, "..");
const webOutput = join(rootDir, "apps/web/.output/public");
const buildsDir = join(e2eDir, ".builds");

const run = (command) => execSync(command, { cwd: rootDir, stdio: "inherit" });

/** Copies the generated public output to e2e/.builds/<name> and returns the nuxt build id it contains. */
function snapshot(name) {
    const target = join(buildsDir, name);
    rmSync(target, { recursive: true, force: true });
    cpSync(webOutput, target, { recursive: true });
    const latest = JSON.parse(readFileSync(join(target, "_nuxt/builds/latest.json"), "utf8"));
    return latest.id;
}

run("pnpm turbo run build --filter=api");
run("pnpm turbo run generate --filter=web");
const idA = snapshot("a");

run("pnpm --filter web generate");
const idB = snapshot("b");

if (idA === idB) {
    throw new Error(`E2E builds A and B have the same nuxt build id (${idA}); the upgrade scenario needs two builds`);
}
console.log(`E2E builds ready: a=${idA} b=${idB}`);
