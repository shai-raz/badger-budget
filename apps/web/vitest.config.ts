import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
    test: {
        environment: "node",
        include: ["app/**/*.test.ts"],
        // Pin the TZ so DST/local-date tests (relativeTime.test.ts, month.test.ts)
        // actually exercise local-time logic instead of passing vacuously on a UTC CI runner.
        env: { TZ: "America/New_York" },
    },
});
