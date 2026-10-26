import { readFileSync } from "fs";
import { join } from "path";

/**
 * Keeps the compose files' app environment lists in sync. Each entry is compared with the first one (the root
 * docker-compose.yml), minus its hostOnly keys. Append a new compose file here to cover it.
 */
interface ComposeFile {
    path: string;
    hostOnly: string[];
}

const FILES: ComposeFile[] = [
    { path: join(__dirname, "../../../../docker-compose.yml"), hostOnly: [] },
    {
        path: join(__dirname, "../../../../deploy/coolify/docker-compose.yml"),
        hostOnly: ["SERVICE_URL_APP_8080"],
    },
];

const DEPLOY_WEBHOOK_KEYS = [
    "DEPLOY_WEBHOOK_URL",
    "DEPLOY_WEBHOOK_TOKEN",
    "DEPLOY_WEBHOOK_TOKEN_HEADER",
    "DEPLOY_WEBHOOK_BODY",
];

function indentOf(line: string): number {
    return line.length - line.trimStart().length;
}

/**
 * Returns the variable names in a service's `environment:` block. It reads lines, not YAML, because no YAML parser is
 * a declared dependency. It handles the map form (`KEY: value`) and the list form (`- KEY=value` or `- KEY`).
 * Comment lines are skipped. The block ends at the first non-blank line that is not indented deeper than `environment:`.
 */
export function parseServiceEnvironmentKeys(yaml: string, service = "app"): string[] {
    const lines = yaml.split(/\r?\n/);
    const serviceLine = new RegExp(`^\\s+${service}:\\s*$`);
    const serviceIndex = lines.findIndex((line) => serviceLine.test(line));
    if (serviceIndex === -1) throw new Error(`No "${service}" service in the compose file`);

    const serviceIndent = indentOf(lines[serviceIndex]);
    let envIndex = -1;
    for (let i = serviceIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() !== "" && indentOf(line) <= serviceIndent) break;
        if (line.trim() === "environment:") {
            envIndex = i;
            break;
        }
    }
    if (envIndex === -1) throw new Error(`No environment block under the "${service}" service`);

    const envIndent = indentOf(lines[envIndex]);
    const keys: string[] = [];
    for (let i = envIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#")) continue;
        if (indentOf(line) <= envIndent) break;

        if (trimmed.startsWith("- ")) {
            keys.push(trimmed.slice(2).split("=")[0].trim());
        } else {
            const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(trimmed);
            if (match) keys.push(match[1]);
        }
    }
    return keys;
}

function readCompose(path: string): string {
    return readFileSync(path, "utf8");
}

describe("parseServiceEnvironmentKeys", () => {
    it("reads the map form and ignores comments, blank lines and other services", () => {
        const yaml = [
            "services:",
            "    app:",
            "        image: example",
            "        environment:",
            "            # A comment",
            "            DATABASE_URL: postgresql://u:p@db:5432/b",
            "",
            "            PUBLIC_URL: ${PUBLIC_URL:-http://localhost:8080}",
            "            TRUST_PROXY_HOPS: 0",
            "        volumes:",
            "            - app_data:/data",
            "    db:",
            "        environment:",
            "            POSTGRES_USER: badger",
        ].join("\n");

        expect(parseServiceEnvironmentKeys(yaml)).toEqual(["DATABASE_URL", "PUBLIC_URL", "TRUST_PROXY_HOPS"]);
    });

    it("reads the list form, with and without a value", () => {
        const yaml = [
            "services:",
            "    app:",
            "        environment:",
            "            - SERVICE_URL_APP_8080",
            "            - PUBLIC_URL=${SERVICE_URL_APP}",
            "            # - COMMENTED_OUT=1",
            "            - SEED_DEMO=${SEED_DEMO:-}",
            "volumes:",
            "    app_data: {}",
        ].join("\n");

        expect(parseServiceEnvironmentKeys(yaml)).toEqual(["SERVICE_URL_APP_8080", "PUBLIC_URL", "SEED_DEMO"]);
    });

    it("throws when the service or its environment block is missing", () => {
        expect(() => parseServiceEnvironmentKeys("services:\n    db:\n        image: postgres\n")).toThrow(
            'No "app" service',
        );
        expect(() => parseServiceEnvironmentKeys("services:\n    app:\n        image: example\n")).toThrow(
            'No environment block under the "app" service',
        );
    });
});

describe("compose files", () => {
    const [reference, ...others] = FILES;
    const referenceKeys = parseServiceEnvironmentKeys(readCompose(reference.path)).filter(
        (key) => !reference.hostOnly.includes(key),
    );

    it("the reference file has an environment list to compare", () => {
        expect(referenceKeys.length).toBeGreaterThan(10);
    });

    it.each(others.map((file) => [file.path, file] as const))(
        "%s lists the same app variables as the root file",
        (_, file) => {
            const keys = parseServiceEnvironmentKeys(readCompose(file.path)).filter(
                (key) => !file.hostOnly.includes(key),
            );
            expect([...new Set(keys)].sort()).toEqual([...new Set(referenceKeys)].sort());
        },
    );

    it.each(FILES.map((file) => [file.path, file] as const))(
        "%s sets all four DEPLOY_WEBHOOK_* variables",
        (_, file) => {
            const keys = parseServiceEnvironmentKeys(readCompose(file.path));
            for (const key of DEPLOY_WEBHOOK_KEYS) {
                expect(keys).toContain(key);
            }
        },
    );
});
