import { defineConfig } from "vitest/config";
import { defineVitestProject } from "@nuxt/test-utils/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    test: {
        projects: [
            {
                resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
                test: {
                    name: "unit",
                    environment: "node",
                    include: ["app/**/*.test.ts"],
                    exclude: ["app/**/*.nuxt.test.ts", "**/node_modules/**"],
                    // Pin the TZ so DST/local-date tests (relativeTime.test.ts, month.test.ts)
                    // actually exercise local-time logic instead of passing vacuously on a UTC CI runner.
                    env: { TZ: "America/New_York" },
                },
            },
            await defineVitestProject({
                test: {
                    name: "nuxt",
                    include: ["app/**/*.nuxt.test.ts"],
                    environment: "nuxt",
                    environmentOptions: { nuxt: { domEnvironment: "happy-dom" } },
                    // Each file boots a Nuxt app in beforeAll (~9s alone); sharing CPU with the unit project pushes it
                    // past the 10s default.
                    hookTimeout: 60_000,
                    // Same TZ pin as the unit project (see above).
                    env: { TZ: "America/New_York" },
                },
            }),
        ],
    },
});
