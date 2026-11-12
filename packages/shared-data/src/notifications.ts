// Notifications (Web Push). Adding a type = an id in NOTIFICATION_TYPES + a NOTIFICATION_TYPE_REGISTRY entry
// + a NotificationDataMap entry. `url` on a notification is a same-origin path, never an absolute URL.
export const NOTIFICATION_TYPES = [
    "system.update-available",
    "system.test",
    "auto-sync.run",
    "auto-sync.result",
    "auto-sync.expiring",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: unknown): value is NotificationType {
    return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export const NOTIFICATION_ACTIONS = ["upgrade-now", "how-to-upgrade"] as const;
export type NotificationActionId = (typeof NOTIFICATION_ACTIONS)[number];

export function isNotificationActionId(value: unknown): value is NotificationActionId {
    return typeof value === "string" && (NOTIFICATION_ACTIONS as readonly string[]).includes(value);
}

export type NotificationRole = "USER" | "ADMIN";

export interface NotificationTypeDefinition {
    label: string;
    description: string;
    defaultEnabled: boolean;
    /** Roles that may receive the type; omitted means every user. */
    roles?: readonly NotificationRole[];
    /** Mandatory types cannot be turned off in preferences. */
    mandatory: boolean;
    /** Listed types appear on the settings page. */
    listed: boolean;
}

export type NotificationTypeRegistry<T extends string = NotificationType> = Record<T, NotificationTypeDefinition>;

export const NOTIFICATION_TYPE_REGISTRY: NotificationTypeRegistry = {
    "system.update-available": {
        label: "New version available",
        description: "When a new Badger Budget release is out (admins only).",
        defaultEnabled: true,
        roles: ["ADMIN"],
        mandatory: false,
        listed: true,
    },
    "system.test": {
        label: "Test notification",
        description: "Sent from the developer options.",
        defaultEnabled: true,
        mandatory: false,
        listed: false,
    },
    // Sent by subscription id, so preferences cannot apply.
    "auto-sync.run": {
        label: "Auto-sync run",
        description: "Starts a scheduled bank sync on this device.",
        defaultEnabled: true,
        mandatory: true,
        listed: false,
    },
    // The one settings entry for all auto-sync notices. They can't be muted, because every auto-sync push must show
    // a notice. The settings page shows this entry only while auto-sync is on.
    "auto-sync.result": {
        label: "Auto-sync",
        description: "Sync’s result, and a reminder to keep auto-sync on.",
        defaultEnabled: true,
        mandatory: true,
        listed: true,
    },
    // Covered by the Auto-sync entry.
    "auto-sync.expiring": {
        label: "Auto-sync ending",
        description: "When automatic sync is about to stop.",
        defaultEnabled: true,
        mandatory: true,
        listed: false,
    },
};

/** The settings entry that stands for every auto-sync notice. */
export const AUTO_SYNC_SETTINGS_TYPE = "auto-sync.result" satisfies NotificationType;

/** Payload data per type, keyed by NotificationType; extended together with NOTIFICATION_TYPES. */
export interface NotificationDataMap {
    "system.update-available": { version: string };
    "system.test": Record<string, never>;
    "auto-sync.run": { grantId: string; runToken: string };
    "auto-sync.result": { quiet: boolean; newTransactions: number; failedConnectionCount: number };
    "auto-sync.expiring": { expiresAt: string };
}

export interface NotificationActionLink {
    id: NotificationActionId;
    title: string;
    url: string;
}

export type NotificationContent = {
    [K in NotificationType]: {
        type: K;
        title: string;
        body: string;
        url: string;
        actions?: NotificationActionLink[];
        data: NotificationDataMap[K];
    };
}[NotificationType];

/** What the service worker receives: the content plus a tag that collapses repeats of the same notification. */
export type PushMessage = NotificationContent & { tag: string };

export const PUSH_URGENCIES = ["very-low", "low", "normal", "high"] as const;
export type PushUrgency = (typeof PUSH_URGENCIES)[number];
