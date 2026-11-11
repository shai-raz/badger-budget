import { cpSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { signInAsDemo } from "./helpers/auth";
import { BUILDS_DIR, CURRENT_BUILD_DIR, waitForServiceWorker } from "./helpers/server";

// localStorage key from apps/web/app/utils/upgradeTracking.ts (PENDING_UPGRADE_KEY). The e2e tsconfig does not reach
// the web app, so it is repeated here.
const PENDING_UPGRADE_KEY = "pendingUpgrade";
const TARGET_VERSION = "9.9.9";

type BuildName = "a" | "b";

const buildIdOf = (name: BuildName): string =>
    JSON.parse(readFileSync(join(BUILDS_DIR, name, "_nuxt/builds/latest.json"), "utf8")).id;

/** Makes e2e/.builds/current a copy of the named build; the API serves it per request, so no restart is needed. */
const serveBuild = (name: BuildName): void => {
    rmSync(CURRENT_BUILD_DIR, { recursive: true, force: true });
    cpSync(join(BUILDS_DIR, name), CURRENT_BUILD_DIR, { recursive: true });
};

/** The Nuxt build id the loaded page was rendered from. */
const pageBuildId = (page: Page): Promise<string | null> =>
    page.evaluate(
        () =>
            (window as unknown as { __NUXT__?: { config?: { app?: { buildId?: string } } } }).__NUXT__?.config?.app
                ?.buildId ?? null,
    );

/** A GET /system/info body that reports `version` as the running version. */
const systemInfo = (version: string) => ({
    version,
    commit: null,
    latest: version,
    updateAvailable: false,
    updateComparable: true,
    checkedAt: new Date().toISOString(),
    updateCheckEnabled: false,
    upgradeAvailable: false,
    releaseUrl: null,
});

// Two real builds, not a version bump in the page: the tab starts on A, the server is switched to B, and Reload must
// land the tab on B through the service worker.
test.describe.serial("upgrade reload across two builds", () => {
    const buildA = buildIdOf("a");
    const buildB = buildIdOf("b");

    test.beforeAll(() => {
        expect(buildB, "builds a and b must be different builds").not.toBe(buildA);
        serveBuild("a");
    });

    test.afterAll(() => {
        serveBuild("a");
    });

    test("Reload moves a tab that is ready on build A onto build B", async ({ page }) => {
        await signInAsDemo(page);
        await waitForServiceWorker(page);
        await expect.poll(() => pageBuildId(page)).toBe(buildA);

        // The server reports the target as running, so this tab on build A reaches "ready".
        await page.route("**/api/v1/system/info", (route) => route.fulfill({ json: systemInfo(TARGET_VERSION) }));
        const userId = await page.evaluate(async () => {
            const token = localStorage.getItem("access_token");
            const response = await fetch("/api/v1/auth/me", { headers: { authorization: `Bearer ${token}` } });
            return ((await response.json()) as { id: string }).id;
        });
        const pending = {
            userId,
            targetVersion: TARGET_VERSION,
            fromVersion: "1.0.0",
            fromBuildId: buildA,
            startedAt: Date.now(),
        };
        await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
            key: PENDING_UPGRADE_KEY,
            value: JSON.stringify(pending),
        });
        await page.reload();

        await expect(page.getByText(`v${TARGET_VERSION} is ready`)).toBeVisible();
        expect(await pageBuildId(page)).toBe(buildA);

        serveBuild("b");
        await page.locator(".p-toast").getByRole("button", { name: "Reload", exact: true }).click();

        await expect.poll(() => pageBuildId(page), { timeout: 30_000 }).toBe(buildB);
        await expect(page.getByText(`Upgraded to v${TARGET_VERSION}`)).toBeVisible();
    });
});
