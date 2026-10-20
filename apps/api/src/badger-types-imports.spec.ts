import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// @badger/types is a devDependency whose main is TS source, so it is not in the Docker image. A value import would
// crash the container at boot ("module not found") while every local check passes. Only `import type` is allowed.
// The ESLint rule (no-restricted-imports in eslint.config.mjs) reports the same thing, but this repo's shared config
// downgrades every ESLint error to a warning (eslint-plugin-only-warn), so this test is what actually fails.
const VALUE_IMPORT_OF_BADGER_TYPES =
    /\bimport\s+(?!type\s)(?:[^;'"]*?\s+from\s+)?["']@badger\/types["']|\bexport\s+(?!type\s)[^;'"]*?\s+from\s+["']@badger\/types["']|\bimport\(\s*["']@badger\/types["']/;

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir, { recursive: true })
        .map(String)
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".spec.ts"))
        .map((file) => join(dir, file));
}

describe("@badger/types imports", () => {
    it("detects value imports, re-exports and dynamic imports", () => {
        const valueImports = [
            `import { IAppConfigResponse } from "@badger/types";`,
            `import IAppConfigResponse from '@badger/types';`,
            `import {\n    A,\n    B,\n} from "@badger/types";`,
            `import { type A } from "@badger/types";`,
            `import "@badger/types";`,
            `export { A } from "@badger/types";`,
            `const t = await import("@badger/types");`,
        ];
        const typeOnlyOrOtherPackage = [
            `import type { IAppConfigResponse } from "@badger/types";`,
            `import type {\n    A,\n    B,\n} from "@badger/types";`,
            `export type { A } from "@badger/types";`,
            `import typeHelpers from "./type-helpers";`,
            `import { A } from "@badger/shared-data";`,
        ];

        for (const source of valueImports) {
            expect(VALUE_IMPORT_OF_BADGER_TYPES.test(source)).toBe(true);
        }
        for (const source of typeOnlyOrOtherPackage) {
            expect(VALUE_IMPORT_OF_BADGER_TYPES.test(source)).toBe(false);
        }
    });

    it("has no value imports of @badger/types in apps/api/src", () => {
        const offenders = listSourceFiles(__dirname).filter((file) =>
            VALUE_IMPORT_OF_BADGER_TYPES.test(readFileSync(file, "utf8")),
        );

        expect(offenders).toEqual([]);
    });
});
