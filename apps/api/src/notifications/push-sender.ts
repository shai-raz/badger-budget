import { sendNotification, WebPushError } from "web-push";
import type { PushUrgency } from "@badger/shared-data";
import type { VapidConfig } from "./vapid";

export interface PushSendTarget {
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

export interface PushSendOptions {
    /** Seconds the push service keeps the message for an offline device. */
    ttl: number;
    urgency: PushUrgency;
}

/** Delivers one encrypted payload to one subscription. Rejects with a WebPushError on a non-2xx response. */
export type PushSender = (target: PushSendTarget, body: string, options: PushSendOptions) => Promise<void>;

const PUSH_TIMEOUT_MS = 10_000;

export function createWebPushSender(vapid: VapidConfig): PushSender {
    return async (target, body, options) => {
        // No Topic header: the message tag is a client-side collapse key and must not reach the push service.
        await sendNotification(target, body, {
            TTL: options.ttl,
            urgency: options.urgency,
            vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
            timeout: PUSH_TIMEOUT_MS,
        });
    };
}

/** The HTTP status a push service answered with, or undefined for a network error or any non-push error. */
export function pushErrorStatus(err: unknown): number | undefined {
    return err instanceof WebPushError ? err.statusCode : undefined;
}
