import { expect, test, type Page } from "@playwright/test";
import { signInAsDemo } from "./helpers/auth";
import { deliverPush, getNotifications, grantNotificationPermission } from "./helpers/push";
import { waitForServiceWorker } from "./helpers/server";

// localStorage key from apps/web/app/utils/upgradeTracking.ts (PENDING_UPGRADE_KEY). The e2e tsconfig does not reach
// the web app, so it is repeated here.
const PENDING_UPGRADE_KEY = "pendingUpgrade";
const RUNNING_VERSION = "0.3.1";
const LATEST_VERSION = "0.4.0";

// The payload apps/api/src/system/update-notification.ts builds with the upgrade action, plus the tag the push
// service adds (push.service.ts defaults it to the notification type).
const UPDATE_PUSH = {
    type: "system.update-available",
    title: `Badger Budget v${LATEST_VERSION} is available`,
    body: "Tap to see what's new, or upgrade now.",
    url: "/?update=open",
    data: { version: LATEST_VERSION },
    actions: [{ id: "upgrade-now", title: "Upgrade now", url: "/?update=upgrade" }],
    tag: "system.update-available",
};

// NotificationEvent is not in the DOM lib. The browser provides it inside the service worker, where the click runs.
declare class NotificationEvent extends Event {
    constructor(type: string, init: { notification: Notification; action?: string });
}

/** A GET /system/info body for a server one release behind LATEST_VERSION. */
const systemInfo = (upgradeAvailable: boolean) => ({
    version: RUNNING_VERSION,
    commit: null,
    latest: LATEST_VERSION,
    updateAvailable: true,
    updateComparable: true,
    checkedAt: new Date().toISOString(),
    updateCheckEnabled: true,
    upgradeAvailable,
    releaseUrl: null,
});

/**
 * Stubs the update endpoints: the demo user is not an admin, so the real ones would not answer. Returns the number of
 * POST /system/upgrade calls the stub has answered.
 */
async function stubUpdateApi(page: Page, upgradeAvailable: boolean): Promise<{ upgradeCalls: () => number }> {
    let calls = 0;
    await page.route("**/api/v1/system/info", (route) => route.fulfill({ json: systemInfo(upgradeAvailable) }));
    await page.route("**/api/v1/system/upgrade", async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        calls += 1;
        await route.fulfill({ status: 202, json: { targetVersion: LATEST_VERSION } });
    });
    return { upgradeCalls: () => calls };
}

/** Signs in as the demo user and opens `path`, with no upgrade left in this browser from an earlier load. */
async function openSignedIn(page: Page, path = "/"): Promise<void> {
    await signInAsDemo(page);
    await page.goto("/");
    await page.evaluate((key) => localStorage.removeItem(key), PENDING_UPGRADE_KEY);
    if (path !== "/") await page.goto(path);
}

test("?update=upgrade starts the upgrade once and drops the param", async ({ page }) => {
    const api = await stubUpdateApi(page, true);
    await openSignedIn(page, "/?update=upgrade");

    await expect(page).not.toHaveURL(/update=/);
    await expect(page.locator(".p-toast").getByText(`Upgrading to v${LATEST_VERSION}`, { exact: true })).toBeVisible();
    expect(api.upgradeCalls()).toBe(1);

    // The param is gone, so a reload must not start a second upgrade.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/update=/);
    expect(api.upgradeCalls()).toBe(1);
});

test("?update=open opens the update dialog and starts no upgrade", async ({ page }) => {
    const api = await stubUpdateApi(page, true);
    await openSignedIn(page, "/?update=open");

    await expect(page).not.toHaveURL(/update=/);
    await expect(page.getByRole("dialog")).toContainText("Update available");
    await page.waitForLoadState("networkidle");
    expect(api.upgradeCalls()).toBe(0);
});

test("?update=upgrade starts nothing when the server cannot upgrade, and still drops the param", async ({ page }) => {
    const api = await stubUpdateApi(page, false);
    await openSignedIn(page, "/?update=upgrade");

    await expect(page).not.toHaveURL(/update=/);
    await page.waitForLoadState("networkidle");
    expect(api.upgradeCalls()).toBe(0);
});

test("the Upgrade now notification action starts the upgrade once", async ({ page, context }) => {
    await grantNotificationPermission(context);
    const api = await stubUpdateApi(page, true);
    await openSignedIn(page);
    await waitForServiceWorker(page);

    await deliverPush(page, UPDATE_PUSH);
    await expect.poll(() => getNotifications(page, UPDATE_PUSH.tag)).toHaveLength(1);

    // Synthetic click on the action button: the worker's handler routes to the action's url, which reloads the app
    // with ?update=upgrade. A real click is covered by the unit tests and checked by hand.
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await worker.evaluate(async (tag) => {
        const scope = self as unknown as {
            registration: ServiceWorkerRegistration;
            dispatchEvent(event: Event): boolean;
        };
        const [notification] = await scope.registration.getNotifications({ tag });
        if (!notification) throw new Error(`no notification tagged ${tag}`);
        scope.dispatchEvent(new NotificationEvent("notificationclick", { notification, action: "upgrade-now" }));
    }, UPDATE_PUSH.tag);

    await expect(page).not.toHaveURL(/update=/);
    await expect(page.locator(".p-toast").getByText(`Upgrading to v${LATEST_VERSION}`, { exact: true })).toBeVisible();
    expect(api.upgradeCalls()).toBe(1);
});
