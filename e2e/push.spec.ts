import { expect, test } from "@playwright/test";
import { signInAsDemo } from "./helpers/auth";
import { deliverPush, getNotifications, grantNotificationPermission } from "./helpers/push";
import { waitForServiceWorker } from "./helpers/server";

const FALLBACK = { title: "Badger Budget", body: "You have a new notification." };

// The DOM lib has no NotificationEvent. The browser provides it inside the service worker, where the click test runs.
declare class NotificationEvent extends Event {
    constructor(type: string, init: { notification: Notification });
}

test.beforeEach(async ({ context, page }) => {
    await grantNotificationPermission(context);
    await waitForServiceWorker(page);
});

test("shows a valid push as one notification with its title, body and tag", async ({ page }) => {
    await deliverPush(page, {
        type: "system.test",
        title: "Hello",
        body: "A test push",
        url: "/",
        tag: "e2e-valid",
        data: {},
    });

    await expect
        .poll(() => getNotifications(page, "e2e-valid"))
        .toEqual([expect.objectContaining({ title: "Hello", body: "A test push", tag: "e2e-valid" })]);
});

test("shows the fallback notification for an unknown type", async ({ page }) => {
    await deliverPush(page, { type: "nope" });

    await expect.poll(() => getNotifications(page, "fallback")).toEqual([expect.objectContaining(FALLBACK)]);
});

test("shows the fallback notification for a body that is not JSON", async ({ page }) => {
    await deliverPush(page, "this is not json");

    await expect.poll(() => getNotifications(page, "fallback")).toEqual([expect.objectContaining(FALLBACK)]);
});

test("collapses pushes that share a tag into one notification with the latest body", async ({ page }) => {
    const base = { type: "system.test", title: "Repeat", url: "/", tag: "e2e-collapse", data: {} };

    await deliverPush(page, { ...base, body: "first" });
    await expect.poll(() => getNotifications(page, "e2e-collapse")).toHaveLength(1);

    await deliverPush(page, { ...base, body: "second" });
    await expect
        .poll(() => getNotifications(page, "e2e-collapse"))
        .toEqual([expect.objectContaining({ body: "second" })]);
});

test("clicking a notification navigates the app to its url", async ({ page, context }) => {
    await signInAsDemo(page);
    await page.goto("/");
    await deliverPush(page, {
        type: "system.test",
        title: "Open settings",
        body: "Click me",
        url: "/settings",
        tag: "e2e-click",
        data: {},
    });
    await expect.poll(() => getNotifications(page, "e2e-click")).toHaveLength(1);

    // Synthetic click: the worker's handler reads the notification and its data. A real click (focus and
    // openWindow under user activation) is covered by the unit tests and checked by hand.
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await worker.evaluate(async (tag) => {
        const scope = self as unknown as {
            registration: ServiceWorkerRegistration;
            dispatchEvent(event: Event): boolean;
        };
        const [notification] = await scope.registration.getNotifications({ tag });
        if (!notification) throw new Error(`no notification tagged ${tag}`);
        scope.dispatchEvent(new NotificationEvent("notificationclick", { notification }));
    }, "e2e-click");

    await expect(page).toHaveURL(/\/settings$/);
});
