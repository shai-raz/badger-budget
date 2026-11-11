import type { NotificationContent } from "@badger/shared-data";

/** Push content for "a newer release is out". Tapping the notification opens UpdateDialog via the ?update= query. */
export function buildUpdateAvailableNotification(version: string, upgradeConfigured: boolean): NotificationContent {
    const base = {
        type: "system.update-available" as const,
        title: `Badger Budget v${version} is available`,
        url: "/?update=open",
        data: { version },
    };
    if (upgradeConfigured) {
        return {
            ...base,
            body: "Tap to see what's new, or upgrade now.",
            actions: [{ id: "upgrade-now", title: "Upgrade now", url: "/?update=upgrade" }],
        };
    }
    return {
        ...base,
        body: "Tap to see what's new and how to upgrade.",
        actions: [{ id: "how-to-upgrade", title: "How to upgrade", url: "/?update=open" }],
    };
}
