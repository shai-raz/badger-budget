// Notifications (Web Push). Adding a type = an id in NOTIFICATION_TYPES + a NOTIFICATION_TYPE_REGISTRY entry
// + a NotificationDataMap entry. `url` on a notification is a same-origin path, never an absolute URL.
export const NOTIFICATION_TYPES = ["system.update-available", "system.test"] as const;
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
};

/** Payload data per type, keyed by NotificationType; extended together with NOTIFICATION_TYPES. */
export interface NotificationDataMap {
    "system.update-available": { version: string };
    "system.test": Record<string, never>;
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
