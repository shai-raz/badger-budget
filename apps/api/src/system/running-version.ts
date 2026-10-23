import { readFileSync } from "fs";
import { resolve } from "path";
import { normalizeVersion } from "./version";

export interface RunningVersion {
    version: string | null;
    commit: string | null;
}

/**
 * Version of the running build. APP_VERSION (stamped into CI images) wins. Without it, a local run reports the
 * package version as "<pkg>-dev". Empty GIT_SHA counts as unset, since docker ARGs default to empty strings.
 */
export function resolveRunningVersion(
    env: { APP_VERSION?: string; GIT_SHA?: string },
    readPackageVersion: () => string | null,
): RunningVersion {
    const appVersion = env.APP_VERSION?.trim();
    let version: string | null = null;
    if (appVersion) {
        version = normalizeVersion(appVersion);
    } else {
        const pkg = readPackageVersion()?.trim();
        version = pkg ? `${normalizeVersion(pkg)}-dev` : null;
    }
    return { version, commit: env.GIT_SHA?.trim() || null };
}

/**
 * Reads apps/api/package.json. The path is the same from src/system (Jest) and dist/system (built output).
 * Returns null on any failure instead of throwing.
 */
export function readApiPackageVersion(): string | null {
    try {
        const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as { version?: unknown };
        return typeof pkg.version === "string" && pkg.version.trim() ? pkg.version.trim() : null;
    } catch {
        return null;
    }
}
