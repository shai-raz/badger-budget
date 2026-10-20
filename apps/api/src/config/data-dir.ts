import { join } from "path";

/**
 * Root for runtime state the API writes (generated secrets, debug artifacts). DATA_DIR wins when set;
 * otherwise it falls back to ./data under the working directory, which is the dev default.
 */
export function resolveDataDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
    const dataDir = env.DATA_DIR?.trim();
    return dataDir || join(cwd, "data");
}

/**
 * Directory for debug artifacts. DEBUG_ARTIFACTS_DIR overrides everything; otherwise it sits under DATA_DIR
 * when that is set, and under the working directory when it is not.
 */
export function resolveDebugArtifactsDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
    const override = env.DEBUG_ARTIFACTS_DIR?.trim();
    if (override) return override;
    const dataDir = env.DATA_DIR?.trim();
    return dataDir ? join(dataDir, "debug-artifacts") : join(cwd, "debug-artifacts");
}
