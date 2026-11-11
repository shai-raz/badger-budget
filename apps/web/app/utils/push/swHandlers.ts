import {
    NOTIFICATION_ACTIONS,
    isNotificationActionId,
    isNotificationType,
    type NotificationActionId,
    type NotificationActionLink,
    type NotificationType,
    type PushMessage,
} from "@badger/shared-data";
import type { AutoSyncKeyRecord } from "./autoSyncKeyStore";

// Pure push and click logic for the service worker. Structural interfaces stand in for the DOM and
// WebWorker globals so this compiles under both libs and runs under node tests (see reloadToNewBuild.ts).

/** NotificationOptions plus `actions`, which the DOM lib typings omit. */
export interface ShowOptions extends NotificationOptions {
    actions?: { action: string; title: string }[];
}

/** Stored in notification.data so a click can route without re-reading the push payload. */
export interface NotificationTarget {
    url: string;
    actions: Partial<Record<NotificationActionId, string>>;
}

export interface SwWindowClient {
    url: string;
    focused: boolean;
    navigate(url: string): Promise<unknown>;
    focus(): Promise<unknown>;
}

export interface SwClients {
    matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<readonly SwWindowClient[]>;
    openWindow(url: string): Promise<unknown>;
}

export interface PushDeps {
    showNotification(title: string, options: ShowOptions): Promise<void>;
    fetch: typeof fetch;
    /** The device-held auto-sync key, or null when none is stored. Never throws. */
    loadAutoSyncKey: () => Promise<AutoSyncKeyRecord | null>;
    /** Closes every shown notification with this tag. */
    closeNotifications: (tag: string) => Promise<void>;
}

/** A null result means the handler already dealt with the notification itself (showed or closed it). */
export type PushTypeHandler = (
    message: PushMessage,
    deps: PushDeps,
) => Promise<{ title: string; options: ShowOptions } | null>;

/**
 * Merged over every shown notification in handlePush, so no PushTypeHandler can ship without them. The badge is
 * monochrome and alpha-only: Android draws it in the status bar.
 */
const NOTIFICATION_IMAGES = { icon: "/pwa-192x192.png", badge: "/badge-96x96.png" };

export const FALLBACK_NOTIFICATION = {
    title: "Badger Budget",
    body: "You have a new notification.",
    url: "/",
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses the action list; absent means none, any malformed entry rejects the whole message. */
function parseActions(value: unknown): NotificationActionLink[] | null {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return null;
    const actions: NotificationActionLink[] = [];
    for (const entry of value) {
        if (!isRecord(entry)) return null;
        const { id, title, url } = entry;
        if (!isNotificationActionId(id) || typeof title !== "string" || typeof url !== "string") return null;
        actions.push({ id, title, url });
    }
    return actions;
}

/** Returns the typed message, or null for bad JSON or any missing or mistyped field. */
export function parsePushMessage(text: string | null): PushMessage | null {
    if (text === null) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return null;
    }
    if (!isRecord(raw)) return null;
    const { type, title, body, url, tag, data } = raw;
    if (!isNotificationType(type) || typeof title !== "string" || typeof body !== "string") return null;
    if (typeof url !== "string" || typeof tag !== "string" || !isRecord(data)) return null;
    const actions = parseActions(raw.actions);
    if (actions === null) return null;

    const base = { title, body, url, tag, actions };
    switch (type) {
        case "system.update-available":
            return typeof data.version === "string" ? { ...base, type, data: { version: data.version } } : null;
        case "system.test":
            return { ...base, type, data: {} };
        case "auto-sync.run":
            return typeof data.grantId === "string" && typeof data.runToken === "string"
                ? { ...base, type, data: { grantId: data.grantId, runToken: data.runToken } }
                : null;
        case "auto-sync.result":
            return typeof data.quiet === "boolean" &&
                typeof data.newTransactions === "number" &&
                typeof data.failedConnectionCount === "number"
                ? {
                      ...base,
                      type,
                      data: {
                          quiet: data.quiet,
                          newTransactions: data.newTransactions,
                          failedConnectionCount: data.failedConnectionCount,
                      },
                  }
                : null;
        case "auto-sync.expiring":
            return typeof data.expiresAt === "string" ? { ...base, type, data: { expiresAt: data.expiresAt } } : null;
    }
}

/** Same-origin absolute or relative URLs become a path; anything else (other origins, schemes) becomes "/". */
export function safeAppPath(url: unknown, origin: string): string {
    if (typeof url !== "string") return "/";
    try {
        const parsed = new URL(url, origin);
        if (parsed.origin !== new URL(origin).origin) return "/";
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return "/";
    }
}

/** Shared by every v1 type until a type needs its own handler. */
export function defaultHandler(message: PushMessage): { title: string; options: ShowOptions } {
    const actionUrls: Partial<Record<NotificationActionId, string>> = {};
    for (const action of message.actions ?? []) actionUrls[action.id] = action.url;
    const target: NotificationTarget = { url: message.url, actions: actionUrls };
    return {
        title: message.title,
        options: {
            body: message.body,
            tag: message.tag,
            actions: message.actions?.map((action) => ({ action: action.id, title: action.title })),
            data: target,
        },
    };
}

/** Every auto-sync notification shares this tag, so the result replaces the "Syncing…" notification. */
const AUTO_SYNC_TAG = "auto-sync";

/** /run only starts a job and returns a jobId, so a hanging API must not hold the push event open. */
const RUN_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Shows the sync notification first, then calls /run once with the stored key, but only when the key is for this
 * grant. Any failure is swallowed: no retry, and neither the key nor the token is logged.
 */
async function handleAutoSyncRun(message: PushMessage, deps: PushDeps): Promise<null> {
    if (message.type !== "auto-sync.run") throw new Error(`Expected auto-sync.run, got ${message.type}`);
    const shown = defaultHandler(message);
    await deps.showNotification("Syncing your accounts…", {
        ...shown.options,
        tag: AUTO_SYNC_TAG,
        ...NOTIFICATION_IMAGES,
    });
    try {
        const record = await deps.loadAutoSyncKey();
        if (record && record.grantId === message.data.grantId) {
            await deps.fetch(`${record.apiBaseUrl}/bank-sync/auto-sync/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "omit",
                signal: AbortSignal.timeout(RUN_REQUEST_TIMEOUT_MS),
                body: JSON.stringify({ grantId: record.grantId, key: record.key, runToken: message.data.runToken }),
            });
        }
    } catch {
        // Not retried: the server run record is the source of truth for what happened.
    }
    return null;
}

/** A quiet result closes the "Syncing…" notification and shows nothing; otherwise the server content replaces it. */
async function handleAutoSyncResult(
    message: PushMessage,
    deps: PushDeps,
): Promise<{ title: string; options: ShowOptions } | null> {
    if (message.type !== "auto-sync.result") throw new Error(`Expected auto-sync.result, got ${message.type}`);
    if (message.data.quiet) {
        await deps.closeNotifications(AUTO_SYNC_TAG);
        return null;
    }
    const shown = defaultHandler(message);
    return { title: shown.title, options: { ...shown.options, tag: AUTO_SYNC_TAG } };
}

export const PUSH_TYPE_HANDLERS: Record<NotificationType, PushTypeHandler> = {
    "system.update-available": (message) => Promise.resolve(defaultHandler(message)),
    "system.test": (message) => Promise.resolve(defaultHandler(message)),
    "auto-sync.run": handleAutoSyncRun,
    "auto-sync.result": handleAutoSyncResult,
    "auto-sync.expiring": (message) => Promise.resolve(defaultHandler(message)),
};

function fallbackOptions(url: string, tag: string): { title: string; options: ShowOptions } {
    return {
        title: FALLBACK_NOTIFICATION.title,
        options: {
            body: FALLBACK_NOTIFICATION.body,
            tag,
            data: { url, actions: {} } satisfies NotificationTarget,
        },
    };
}

/** Every URL in the message goes through safeAppPath before any handler sees it. */
function sanitizeMessage(message: PushMessage, origin: string): PushMessage {
    return {
        ...message,
        url: safeAppPath(message.url, origin),
        actions: message.actions?.map((action) => ({ ...action, url: safeAppPath(action.url, origin) })),
    };
}

/**
 * Shows exactly one notification for a push payload, unless a handler returns null after dealing with it itself.
 * Unparseable or unknown payloads, and handlers that throw, show a fallback so the user still sees that something
 * arrived.
 */
export async function handlePush(
    text: string | null,
    deps: PushDeps & { origin: string },
    handlers: Record<NotificationType, PushTypeHandler> = PUSH_TYPE_HANDLERS,
): Promise<void> {
    const parsed = parsePushMessage(text);
    let shown: { title: string; options: ShowOptions } | null;
    if (!parsed) {
        shown = fallbackOptions(FALLBACK_NOTIFICATION.url, "fallback");
    } else {
        const message = sanitizeMessage(parsed, deps.origin);
        try {
            shown = await handlers[message.type](message, deps);
        } catch {
            shown = fallbackOptions(message.url, message.tag);
        }
    }
    if (shown === null) return;
    await deps.showNotification(shown.title, { ...shown.options, ...NOTIFICATION_IMAGES });
}

/** Reads the stored target, falling back to "/" when the shape is wrong. */
function readTarget(data: unknown): NotificationTarget {
    if (!isRecord(data) || typeof data.url !== "string" || !isRecord(data.actions)) {
        return { url: "/", actions: {} };
    }
    const actions: Partial<Record<NotificationActionId, string>> = {};
    for (const id of NOTIFICATION_ACTIONS) {
        const url = data.actions[id];
        if (typeof url === "string") actions[id] = url;
    }
    return { url: data.url, actions };
}

/**
 * Focuses an existing app window and navigates it to the target, or opens a new one. Navigation must happen even
 * when focus is refused, since focus() can reject without user activation (e.g. synthetic events in E2E).
 */
export async function handleNotificationClick(
    input: { action: string; data: unknown },
    deps: { clients: SwClients; origin: string },
): Promise<void> {
    const { clients, origin } = deps;
    const target = readTarget(input.data);
    const actionUrl = isNotificationActionId(input.action) ? target.actions[input.action] : undefined;
    const absolute = new URL(safeAppPath(actionUrl ?? target.url, origin), origin).href;

    const openNew = async () => {
        try {
            await clients.openWindow(absolute);
        } catch {
            // No window can be opened (e.g. blocked); nothing more to do from the worker.
        }
    };

    let windows: readonly SwWindowClient[];
    try {
        windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    } catch {
        windows = [];
    }
    const candidates = windows.filter((candidate) => candidate.url.startsWith(`${origin}/`));
    // Prefer the focused tab: an unfocused one may be uncontrolled, and navigating it would open a duplicate window.
    const client = candidates.find((candidate) => candidate.focused) ?? candidates[0];
    if (!client) {
        await openNew();
        return;
    }

    // Focus goes first: a full page load can outlive the click's window-interaction allowance, so focus must be
    // requested before navigating. Navigation still happens when focus is refused.
    const focusing = attempt(() => client.focus());
    let navigated = true;
    try {
        await client.navigate(absolute);
    } catch {
        navigated = false;
    }
    await focusing;
    if (!navigated) await openNew();
}

/** Runs a best-effort browser call, ignoring its failure. The call is made synchronously, before any await. */
async function attempt(call: () => Promise<unknown>): Promise<void> {
    try {
        await call();
    } catch {
        // Best effort only; the caller decides what else to do.
    }
}
