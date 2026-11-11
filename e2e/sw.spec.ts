import { expect, test } from "@playwright/test";
import { waitForServiceWorker } from "./helpers/server";

test.describe("service worker routing", () => {
    test("serves the app shell while offline", async ({ page, context }) => {
        await waitForServiceWorker(page);

        await context.setOffline(true);
        try {
            await page.reload();
            await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
        } finally {
            await context.setOffline(false);
        }
    });

    test("does not answer /oauth/ navigations from the worker", async ({ page }) => {
        await waitForServiceWorker(page);

        const response = await page.goto("/oauth/consent?client_id=e2e");

        expect(response?.fromServiceWorker()).toBe(false);
    });

    test("does not answer /api/ requests from the worker", async ({ page }) => {
        await waitForServiceWorker(page);

        const response = page.waitForResponse("**/api/v1/health");
        await page.evaluate(() => fetch("/api/v1/health"));

        expect((await response).fromServiceWorker()).toBe(false);
    });
});
