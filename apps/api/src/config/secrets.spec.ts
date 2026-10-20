import { join } from "path";
import { MANAGED_SECRETS, resolveSecrets, SecretsFs } from "./secrets";

interface WriteCall {
    path: string;
    flag: string;
    mode: number;
}

/** Map-backed fs shim that records writes and mkdirs so tests can assert on flags and modes. */
function createMemoryFs(overrides: Partial<SecretsFs> = {}) {
    const files = new Map<string, string>();
    const writes: WriteCall[] = [];
    const dirs: { path: string; mode: number }[] = [];

    const fs: SecretsFs = {
        readFileSync: (p) => {
            const value = files.get(p);
            if (value === undefined) throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
            return value;
        },
        writeFileSync: (p, data, opts) => {
            writes.push({ path: p, flag: opts.flag, mode: opts.mode });
            if (opts.flag === "wx" && files.has(p)) {
                throw Object.assign(new Error(`EEXIST: ${p}`), { code: "EEXIST" });
            }
            files.set(p, data);
        },
        mkdirSync: (p, opts) => {
            dirs.push({ path: p, mode: opts.mode });
        },
        existsSync: (p) => files.has(p),
        ...overrides,
    };

    return { fs, files, writes, dirs };
}

const DATA_DIR = join("/srv", "badger", "data");
const SECRETS_DIR = join(DATA_DIR, "secrets");

describe("resolveSecrets", () => {
    it("keeps an explicit non-empty env value and does not persist it", () => {
        const { fs, writes } = createMemoryFs();
        const env: NodeJS.ProcessEnv = { JWT_SECRET: "from-env" };

        const result = resolveSecrets({ env, dataDir: DATA_DIR, fs });

        expect(env.JWT_SECRET).toBe("from-env");
        expect(result.fromEnv).toEqual(["JWT_SECRET"]);
        expect(writes.map((w) => w.path)).not.toContain(join(SECRETS_DIR, "JWT_SECRET"));
    });

    it("treats an empty or whitespace env value as unset and generates one", () => {
        const { fs } = createMemoryFs();
        const env: NodeJS.ProcessEnv = { JWT_SECRET: "   ", JWT_REFRESH_SECRET: "" };

        const result = resolveSecrets({ env, dataDir: DATA_DIR, fs });

        expect(result.generated).toEqual(expect.arrayContaining(["JWT_SECRET", "JWT_REFRESH_SECRET"]));
        expect(env.JWT_SECRET).not.toBe("   ");
        expect(env.JWT_REFRESH_SECRET).not.toBe("");
        expect(env.JWT_SECRET?.trim()).toBeTruthy();
    });

    it("generates every managed secret on first boot with distinct values", () => {
        const { fs } = createMemoryFs();
        const env: NodeJS.ProcessEnv = {};

        const result = resolveSecrets({ env, dataDir: DATA_DIR, fs });

        expect(result.generated).toEqual([...MANAGED_SECRETS]);
        const values = MANAGED_SECRETS.map((name) => env[name]);
        values.forEach((v) => expect(v).toMatch(/^[A-Za-z0-9_-]{64}$/));
        expect(new Set(values).size).toBe(MANAGED_SECRETS.length);
    });

    it("writes generated secrets with flag wx and mode 0o600, creating the dir with 0o700", () => {
        const { fs, writes, dirs } = createMemoryFs();

        resolveSecrets({ env: {}, dataDir: DATA_DIR, fs });

        expect(dirs.length).toBeGreaterThan(0);
        dirs.forEach((d) => expect(d).toEqual({ path: SECRETS_DIR, mode: 0o700 }));
        expect(writes).toHaveLength(MANAGED_SECRETS.length);
        writes.forEach((w) => expect(w).toMatchObject({ flag: "wx", mode: 0o600 }));
        expect(writes.map((w) => w.path)).toEqual(MANAGED_SECRETS.map((name) => join(SECRETS_DIR, name)));
    });

    it("reuses persisted secrets on a second call so values are stable across restarts", () => {
        const { fs, writes } = createMemoryFs();

        const firstEnv: NodeJS.ProcessEnv = {};
        resolveSecrets({ env: firstEnv, dataDir: DATA_DIR, fs });

        const secondEnv: NodeJS.ProcessEnv = {};
        const result = resolveSecrets({ env: secondEnv, dataDir: DATA_DIR, fs });

        MANAGED_SECRETS.forEach((name) => expect(secondEnv[name]).toBe(firstEnv[name]));
        expect(result.loaded).toEqual([...MANAGED_SECRETS]);
        expect(result.generated).toEqual([]);
        expect(writes).toHaveLength(MANAGED_SECRETS.length);
    });

    it("loads a stored secret when the env value is absent, and trims the file content", () => {
        const { fs, files } = createMemoryFs();
        files.set(join(SECRETS_DIR, "CREDENTIAL_ENCRYPTION_PEPPER"), "stored-pepper\n");
        const env: NodeJS.ProcessEnv = {};

        const result = resolveSecrets({ env, dataDir: DATA_DIR, fs });

        expect(env.CREDENTIAL_ENCRYPTION_PEPPER).toBe("stored-pepper");
        expect(result.loaded).toEqual(["CREDENTIAL_ENCRYPTION_PEPPER"]);
    });

    it("fails with a clear error when the stored file exists but is empty", () => {
        const { fs, files } = createMemoryFs();
        files.set(join(SECRETS_DIR, "JWT_SECRET"), "   ");

        // Empty means unset, so a value is generated, but the file already exists and cannot be replaced safely.
        expect(() => resolveSecrets({ env: {}, dataDir: DATA_DIR, fs })).toThrow(/JWT_SECRET.*is empty/);
    });

    it("re-reads the file when another process wins the create race (EEXIST)", () => {
        const racedPath = join(SECRETS_DIR, "JWT_SECRET");
        const { fs, files } = createMemoryFs({
            writeFileSync: (p, _data, opts) => {
                if (p === racedPath && opts.flag === "wx") {
                    files.set(p, "winner-value");
                    throw Object.assign(new Error(`EEXIST: ${p}`), { code: "EEXIST" });
                }
                files.set(p, _data);
            },
        });
        const env: NodeJS.ProcessEnv = {};

        const result = resolveSecrets({ env, dataDir: DATA_DIR, fs });

        expect(env.JWT_SECRET).toBe("winner-value");
        expect(result.loaded).toContain("JWT_SECRET");
        expect(result.generated).not.toContain("JWT_SECRET");
    });

    it("throws naming the variable when a generated secret cannot be persisted", () => {
        const { fs } = createMemoryFs({
            writeFileSync: () => {
                throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
            },
        });

        expect(() => resolveSecrets({ env: {}, dataDir: DATA_DIR, fs })).toThrow(
            new RegExp(
                `Cannot persist generated JWT_SECRET to .*: EACCES: permission denied.*DATA_DIR \\(${escapeRegExp(DATA_DIR)}\\)`,
            ),
        );
    });

    it("warns once when secrets were generated, without ever logging a secret value", () => {
        const { fs } = createMemoryFs();
        const logger = { log: jest.fn(), warn: jest.fn() };
        const env: NodeJS.ProcessEnv = {};

        resolveSecrets({ env, dataDir: DATA_DIR, fs, logger });

        expect(logger.warn).toHaveBeenCalledTimes(1);
        const message = logger.warn.mock.calls[0][0] as string;
        expect(message).toContain(join(SECRETS_DIR, "CREDENTIAL_ENCRYPTION_PEPPER"));
        expect(message).toMatch(/back up/i);
        MANAGED_SECRETS.forEach((name) => expect(message).not.toContain(env[name] as string));
    });

    it("does not warn when every secret comes from the environment or a stored file", () => {
        const { fs } = createMemoryFs();
        const logger = { log: jest.fn(), warn: jest.fn() };
        const env: NodeJS.ProcessEnv = {
            JWT_SECRET: "a",
            JWT_REFRESH_SECRET: "b",
            CREDENTIAL_ENCRYPTION_PEPPER: "c",
        };

        resolveSecrets({ env, dataDir: DATA_DIR, fs, logger });

        expect(logger.warn).not.toHaveBeenCalled();
    });
});

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
