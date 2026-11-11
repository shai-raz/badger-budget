import { expect, type Page } from "@playwright/test";

// Demo account seeded by the E2E global setup (SEED_DEMO=true). Not a secret: it only exists in local test databases.
export const DEMO_EMAIL = "demo@demo.demo";
export const DEMO_PASSWORD = "demo123QWEasd";

/** Logs in through the API and stores the tokens where the web app keeps them, before any page script runs. */
export async function signInAsDemo(page: Page): Promise<void> {
    const response = await page.request.post("/api/v1/auth/login", {
        data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    });
    expect(response.ok(), "demo login should succeed").toBe(true);
    const tokens = (await response.json()) as { accessToken: string; refreshToken: string };

    await page.addInitScript(
        ({ access, refresh }) => {
            // Keep whatever the app has refreshed since, so later navigations do not reset the session.
            if (localStorage.getItem("access_token")) return;
            localStorage.setItem("access_token", access);
            localStorage.setItem("refresh_token", refresh);
        },
        { access: tokens.accessToken, refresh: tokens.refreshToken },
    );
}
