import { randomBytes } from "crypto";
import * as nodeFs from "fs";
import { join } from "path";

/** Secrets that are generated on first boot when neither the environment nor DATA_DIR/secrets provides them. */
export const MANAGED_SECRETS = ["JWT_SECRET", "JWT_REFRESH_SECRET", "CREDENTIAL_ENCRYPTION_PEPPER"] as const;

/** The subset of the fs module the resolver needs, so tests can run against an in-memory shim. */
export interface SecretsFs {
    readFileSync(p: string, enc: "utf8"): string;
    writeFileSync(p: string, data: string, opts: { flag: string; mode: number }): void;
    mkdirSync(p: string, opts: { recursive: true; mode: number }): unknown;
    existsSync(p: string): boolean;
}

export interface ResolveSecretsResult {
    fromEnv: string[];
    loaded: string[];
    generated: string[];
}

export interface ResolveSecretsOptions {
    env: NodeJS.ProcessEnv;
    dataDir: string;
    fs?: SecretsFs;
    generate?: () => string;
    logger?: { log(message: string): void; warn(message: string): void };
}

const defaultFs: SecretsFs = {
    readFileSync: (p, enc) => nodeFs.readFileSync(p, enc),
    writeFileSync: (p, data, opts) => nodeFs.writeFileSync(p, data, opts),
    mkdirSync: (p, opts) => nodeFs.mkdirSync(p, opts),
    existsSync: (p) => nodeFs.existsSync(p),
};

const defaultGenerate = (): string => randomBytes(48).toString("base64url");

/**
 * Fills each managed secret in env: an explicit non-empty env value wins, then a non-empty file at
 * DATA_DIR/secrets/<NAME>, and otherwise a new random value is generated and saved to that file.
 * Throws when a generated value cannot be persisted, so a misconfigured DATA_DIR fails at boot.
 */
export function resolveSecrets(opts: ResolveSecretsOptions): ResolveSecretsResult {
    const { env, dataDir, fs = defaultFs, generate = defaultGenerate, logger } = opts;
    const secretsDir = join(dataDir, "secrets");
    const result: ResolveSecretsResult = { fromEnv: [], loaded: [], generated: [] };

    for (const name of MANAGED_SECRETS) {
        if (env[name]?.trim()) {
            result.fromEnv.push(name);
            continue;
        }

        const file = join(secretsDir, name);
        const existing = readStoredSecret(fs, file);
        if (existing) {
            env[name] = existing;
            result.loaded.push(name);
            continue;
        }

        const value = generate();
        try {
            fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
            fs.writeFileSync(file, value, { flag: "wx", mode: 0o600 });
        } catch (err) {
            if (errorCode(err) === "EEXIST") {
                // Another process won the race to create the file; use what it wrote.
                const winner = readStoredSecret(fs, file);
                if (winner) {
                    env[name] = winner;
                    result.loaded.push(name);
                    continue;
                }
                throw new Error(
                    `Cannot persist generated ${name} to ${file}: file exists but is empty. Set ${name} in the environment or delete the file.`,
                );
            }
            throw new Error(
                `Cannot persist generated ${name} to ${file}: ${errorMessage(err)}. Set ${name} in the environment or make DATA_DIR (${dataDir}) writable.`,
            );
        }

        env[name] = value;
        result.generated.push(name);
    }

    if (result.generated.length > 0) {
        const files = result.generated.map((name) => join(secretsDir, name));
        logger?.warn(
            `Generated secrets saved to: ${files.join(", ")}. Back up ${secretsDir}: losing CREDENTIAL_ENCRYPTION_PEPPER makes stored bank credentials undecryptable, and changing the JWT secrets logs everyone out.`,
        );
    }

    return result;
}

function readStoredSecret(fs: SecretsFs, file: string): string | undefined {
    if (!fs.existsSync(file)) return undefined;
    const value = fs.readFileSync(file, "utf8").trim();
    return value || undefined;
}

function errorCode(err: unknown): string | undefined {
    return typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
