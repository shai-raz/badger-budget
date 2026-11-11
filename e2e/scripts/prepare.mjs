// Prepares what the E2E API starts with: a migrated and seeded database, the current build and an empty data dir.
// It is the first step of the webServer command in playwright.config.ts, because Playwright starts webServers before
// globalSetup runs (so a globalSetup could not prepare them).
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const e2eDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = resolve(e2eDir, "../apps/api");
const buildsDir = join(e2eDir, ".builds");
const currentBuildDir = join(buildsDir, "current");
const dataDir = join(e2eDir, ".data");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be set (playwright.config.ts passes it to the webServer)");
const env = { ...process.env, DATABASE_URL: databaseUrl, SEED_DEMO: "true" };

// `migrate deploy` creates the database when it is missing, so no separate CREATE DATABASE is needed.
const prismaCli = join(createRequire(join(apiDir, "package.json")).resolve("prisma/package.json"), "../build/index.js");
execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], { cwd: apiDir, env, stdio: "inherit" });
// The seed is idempotent: it skips the demo account when it already exists.
execFileSync(process.execPath, ["dist-seed/prisma/seed.js"], { cwd: apiDir, env, stdio: "inherit" });

rmSync(currentBuildDir, { recursive: true, force: true });
cpSync(join(buildsDir, "a"), currentBuildDir, { recursive: true });

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
