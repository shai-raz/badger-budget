import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, CURRENT_BUILD_DIR, DATABASE_URL, DATA_DIR, E2E_PORT, ROOT_DIR } from "./helpers/server";

// Runs against the production API serving the built SPA on one origin, the same shape as the Docker image.
// Start with `pnpm test:e2e` from the repo root (it builds first unless E2E_SKIP_BUILD=1).
export default defineConfig({
    testDir: __dirname,
    testMatch: /.*\.spec\.ts$/,
    // One API, one database and one browser profile per run: the specs share them, so they run in sequence.
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: [["html", { open: "never" }], ["list"]],
    use: {
        baseURL: BASE_URL,
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            // The default headless shell never returns notifications from getNotifications; "chromium" (new headless) does.
            use: { ...devices["Desktop Chrome"], channel: "chromium" },
        },
    ],
    webServer: {
        // prepare.mjs seeds the database and copies the build before the API starts (see its header).
        command: "node e2e/scripts/prepare.mjs && node apps/api/dist/main.js",
        cwd: ROOT_DIR,
        url: `${BASE_URL}/api/v1/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        // Set explicitly so they win over apps/api/.env, which the API only loads from its own working directory.
        env: {
            NODE_ENV: "production",
            PORT: String(E2E_PORT),
            PUBLIC_URL: BASE_URL,
            DATABASE_URL,
            WEB_DIST_DIR: CURRENT_BUILD_DIR,
            DATA_DIR,
            UPDATE_CHECK: "false",
            SEED_DEMO: "true",
        },
    },
});
