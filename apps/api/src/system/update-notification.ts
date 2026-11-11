import type { NotificationContent } from "@badger/shared-data";

/** Push content for "a newer release is out". Tapping the notification opens UpdateDialog via the ?update= query. */
export function buildUpdateAvailableNotification(
    latest: string,
    running: string,
    upgradeConfigured: boolean,
): NotificationContent {
    const base = {
        type: "system.update-available" as const,
        title: `Badger Budget v${latest} is available`,
        url: "/?update=open",
        data: { version: latest },
    };
    if (upgradeConfigured) {
        return {
            ...base,
            body: `You're on v${running}. Tap to see what's new.`,
            actions: [{ id: "upgrade-now", title: "Upgrade now", url: "/?update=upgrade" }],
        };
    }
    return {
        ...base,
        body: `You're on v${running}. Tap to see how to upgrade.`,
        actions: [{ id: "how-to-upgrade", title: "How to upgrade", url: "/?update=open" }],
    };
}
