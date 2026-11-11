import type { BrowserContext, Page } from "@playwright/test";
import { BASE_URL } from "./server";

export interface ShownNotification {
    title: string;
    body: string;
    tag: string;
    data: unknown;
}

/**
 * Delivers a push message to the app's service worker through the DevTools protocol, the same path a push service
 * uses. Strings go out as-is (for bodies that are not JSON); objects are serialized.
 */
export async function deliverPush(page: Page, payload: string | Record<string, unknown>): Promise<void> {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    const cdp = await page.context().newCDPSession(page);
    try {
        // Listen before enabling: the registrations are reported as an event of ServiceWorker.enable.
        const registrationId = new Promise<string>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error("no service worker registered for the app origin")),
                10_000,
            );
            cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
                const match = registrations.find((registration) => registration.scopeURL.startsWith(BASE_URL));
                if (!match) return;
                clearTimeout(timer);
                resolve(match.registrationId);
            });
        });
        await cdp.send("ServiceWorker.enable");
        await cdp.send("ServiceWorker.deliverPushMessage", {
            origin: BASE_URL,
            registrationId: await registrationId,
            data,
        });
    } finally {
        await cdp.detach();
    }
}

/** Notifications currently shown by the app's service worker, optionally filtered by tag. */
export async function getNotifications(page: Page, tag?: string): Promise<ShownNotification[]> {
    return page.evaluate(async (wantedTag) => {
        const registration = await navigator.serviceWorker.ready;
        const notifications = await registration.getNotifications(wantedTag ? { tag: wantedTag } : undefined);
        return notifications.map((notification) => ({
            title: notification.title,
            body: notification.body,
            tag: notification.tag,
            data: notification.data,
        }));
    }, tag);
}

/** Lets the app's origin show notifications; the worker cannot show them otherwise. */
export async function grantNotificationPermission(context: BrowserContext): Promise<void> {
    await context.grantPermissions(["notifications"], { origin: BASE_URL });
}
