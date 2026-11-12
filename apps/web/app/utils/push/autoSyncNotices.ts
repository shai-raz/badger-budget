// Closes auto-sync notices when Badger is in front, so a finished or stale notice does not linger. Pure and
// lib-neutral: the DOM document and the service-worker registration are passed in as structural types.

/** Every auto-sync notification shares this tag, so the result replaces the "Syncing…" notification. */
export const AUTO_SYNC_TAG = "auto-sync";

/** The part of ServiceWorkerRegistration used here. */
export interface NotificationRegistrationLike {
    getNotifications?(filter: { tag: string }): Promise<readonly { close(): void }[]>;
}

/** Closes every shown notification with this tag. A no-op without a registration or without `getNotifications`. */
export async function closeTaggedNotifications(
    registration: NotificationRegistrationLike | undefined,
    tag: string,
): Promise<void> {
    if (!registration?.getNotifications) return;
    const notifications = await registration.getNotifications({ tag });
    for (const notification of notifications) notification.close();
}

/**
 * Closes auto-sync notices now, and again each time the page becomes visible. Never rejects.
 * Returns a cleanup function that removes the listener.
 */
export function watchAutoSyncNotices(
    doc: {
        visibilityState: string;
        addEventListener(type: "visibilitychange", listener: () => void): void;
        removeEventListener(type: "visibilitychange", listener: () => void): void;
    },
    getRegistration: () => Promise<NotificationRegistrationLike | undefined>,
): () => void {
    const close = () => {
        Promise.resolve()
            .then(getRegistration)
            .then((registration) => closeTaggedNotifications(registration, AUTO_SYNC_TAG))
            .catch(() => undefined);
    };
    const onVisibilityChange = () => {
        if (doc.visibilityState === "visible") close();
    };
    close();
    doc.addEventListener("visibilitychange", onVisibilityChange);
    return () => doc.removeEventListener("visibilitychange", onVisibilityChange);
}
