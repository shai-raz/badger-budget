// Push and notification-click listeners, bundled to sw-push.js (modules/sw-push.ts) and imported by the generated
// worker through workbox.importScripts. Logic lives in app/utils/push/swHandlers.ts; this file is wiring only.
import { loadAutoSyncKey } from "../app/utils/push/autoSyncKeyStore";
import { handleNotificationClick, handlePush } from "../app/utils/push/swHandlers";

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("push", (event) =>
    keepAlive(
        event,
        handlePush(event.data?.text() ?? null, {
            showNotification: (title, options) => self.registration.showNotification(title, options),
            fetch: self.fetch.bind(self),
            loadAutoSyncKey,
            closeNotifications: async (tag) => {
                const notifications = await self.registration.getNotifications({ tag });
                for (const notification of notifications) notification.close();
            },
            origin: self.location.origin,
        }),
    ),
);

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    keepAlive(
        event,
        handleNotificationClick(
            { action: event.action, data: event.notification.data },
            { clients: self.clients, origin: self.location.origin },
        ),
    );
});

function keepAlive(event: ExtendableEvent, work: Promise<void>): void {
    try {
        event.waitUntil(work);
    } catch {
        // Untrusted (synthetic) events, used by the E2E suite, reject waitUntil; the work still runs.
    }
}

export {};
