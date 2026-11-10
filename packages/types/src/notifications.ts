import type { NotificationType } from "@badger/shared-data";

export interface IPushSubscription {
    id: string;
    endpoint: string;
    deviceLabel: string;
    createdAt: string;
    lastSeenAt: string;
    lastAcceptedAt: string | null;
}

export interface IRegisterPushSubscriptionRequest {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    deviceLabel: string;
}

export interface IUnregisterPushSubscriptionRequest {
    endpoint: string;
}

export interface IVapidPublicKeyResponse {
    publicKey: string;
}

export interface INotificationPreference {
    type: NotificationType;
    label: string;
    description: string;
    enabled: boolean;
    mandatory: boolean;
}

export interface IUpdateNotificationPreferencesRequest {
    preferences: { type: NotificationType; enabled: boolean }[];
}

export interface IPushTestResponse {
    sent: number;
    accepted: number;
}
