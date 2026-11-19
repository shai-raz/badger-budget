/**
 * Points a grant at this browser's current push subscription. Proven by the device-held key (no session), so the
 * service worker can send it when the browser replaces its subscription.
 */
export interface IMoveAutoSyncDevice {
    grantId: string;
    key: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
}
