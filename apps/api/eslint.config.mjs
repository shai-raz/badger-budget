import { config } from "@repo/eslint-config/base";

// @badger/types is a devDependency whose main is TS source, so it is not in the Docker image. Type imports are erased
// at build time; a value import would crash the container at boot with "module not found" while local checks pass.
const typesOnlyBadgerTypes = {
    name: "@badger/types",
    allowTypeImports: true,
    message: "@badger/types is types-only in apps/api: use `import type`. It is not in the Docker image.",
};

export default [
    ...config,
    {
        ignores: ["dist/**", "dist-seed/**", "coverage/**", "generated/**"],
    },
    {
        rules: {
            "no-restricted-imports": ["error", { paths: [typesOnlyBadgerTypes] }],
        },
    },
    {
        // The MCP tool layer must stay transport-free so the Phase 2 in-app chatbot can reuse it.
        // Redeclares the rule for this scope, so it repeats the @badger/types path from the block above.
        files: ["src/mcp/tools/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    paths: [typesOnlyBadgerTypes],
                    patterns: ["@modelcontextprotocol/*", "express", "@nestjs/platform-express", "**/oauth/**"],
                },
            ],
        },
    },
];
