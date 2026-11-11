import { describe, expect, it, vi, type Mock } from "vitest";
import type { NotificationType } from "@badger/shared-data";
import {
    FALLBACK_NOTIFICATION,
    PUSH_TYPE_HANDLERS,
    handleNotificationClick,
    handlePush,
    parsePushMessage,
    safeAppPath,
    type PushDeps,
    type PushTypeHandler,
    type ShowOptions,
    type SwClients,
    type SwWindowClient,
} from "./swHandlers";

const ORIGIN = "https://app.test";
const IMAGES = { icon: "/pwa-192x192.png", badge: "/badge-96x96.png" };

function fakeDeps() {
    const showNotification = vi.fn<(title: string, options: ShowOptions) => Promise<void>>(() => Promise.resolve());
    const fetchMock = vi.fn<typeof fetch>();
    const loadAutoSyncKey = vi.fn<PushDeps["loadAutoSyncKey"]>(() => Promise.resolve(null));
    const closeNotifications = vi.fn<PushDeps["closeNotifications"]>(() => Promise.resolve());
    const deps: PushDeps & { origin: string } = {
        showNotification,
        fetch: fetchMock,
        loadAutoSyncKey,
        closeNotifications,
        origin: ORIGIN,
    };
    return { deps, showNotification, fetchMock, loadAutoSyncKey, closeNotifications };
}

interface FakeWindow extends SwWindowClient {
    navigate: Mock<(url: string) => Promise<unknown>>;
    focus: Mock<() => Promise<unknown>>;
}

function fakeWindow(url: string, overrides: Partial<FakeWindow> = {}): FakeWindow {
    return {
        url,
        focused: false,
        navigate: vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve()),
        focus: vi.fn<() => Promise<unknown>>(() => Promise.resolve()),
        ...overrides,
    };
}

function fakeClients(windows: SwWindowClient[] = []) {
    const openWindow = vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve());
    const matchAll = vi.fn<SwClients["matchAll"]>(() => Promise.resolve(windows));
    const clients: SwClients = { matchAll, openWindow };
    return { clients, openWindow, matchAll };
}

const updateMessage = {
    type: "system.update-available",
    title: "New version available",
    body: "Badger Budget 2.0 is out.",
    url: "/settings",
    tag: "update-2.0",
    actions: [
        { id: "upgrade-now", title: "Upgrade now", url: "/settings?upgrade=1" },
        { id: "how-to-upgrade", title: "How to upgrade", url: "/docs/upgrade" },
    ],
    data: { version: "2.0" },
} satisfies Record<string, unknown>;

const autoSyncRunMessage = {
    type: "auto-sync.run",
    title: "Syncing",
    body: "Starting your daily sync",
    url: "/transactions",
    tag: "auto-sync-run",
    data: { grantId: "grant-1", runToken: "token-1" },
} satisfies Record<string, unknown>;

const autoSyncResultMessage = {
    type: "auto-sync.result",
    title: "Auto-sync finished",
    body: "3 new transactions",
    url: "/transactions",
    tag: "auto-sync-result",
    data: { quiet: false, newTransactions: 3, failedConnectionCount: 0 },
} satisfies Record<string, unknown>;

const autoSyncExpiringMessage = {
    type: "auto-sync.expiring",
    title: "Auto-sync ending",
    body: "Automatic sync stops soon",
    url: "/settings",
    tag: "auto-sync-expiring",
    data: { expiresAt: "2026-12-01T00:00:00.000Z" },
} satisfies Record<string, unknown>;

const testMessage = {
    type: "system.test",
    title: "Test",
    body: "Hello",
    url: "/",
    tag: "test-1",
    data: {},
} satisfies Record<string, unknown>;

describe("parsePushMessage", () => {
    it("returns null for null, bad JSON, non-object JSON and unknown types", () => {
        expect(parsePushMessage(null)).toBeNull();
        expect(parsePushMessage("{not json")).toBeNull();
        expect(parsePushMessage("[]")).toBeNull();
        expect(parsePushMessage(JSON.stringify({ ...testMessage, type: "nope" }))).toBeNull();
    });

    it("rejects missing fields and malformed actions", () => {
        const { type, title, body, url, data } = testMessage;
        expect(parsePushMessage(JSON.stringify({ type, title, body, url, data }))).toBeNull();
        expect(parsePushMessage(JSON.stringify({ ...testMessage, actions: "x" }))).toBeNull();
        expect(
            parsePushMessage(JSON.stringify({ ...updateMessage, actions: [{ id: "bogus", title: "x", url: "/" }] })),
        ).toBeNull();
    });

    it("returns the message for a valid payload", () => {
        expect(parsePushMessage(JSON.stringify(updateMessage))).toEqual(updateMessage);
    });

    it.each([
        ["auto-sync.run", autoSyncRunMessage],
        ["auto-sync.result", autoSyncResultMessage],
        ["auto-sync.expiring", autoSyncExpiringMessage],
    ])("accepts a valid %s payload", (_name, message) => {
        expect(parsePushMessage(JSON.stringify(message))).toEqual({ ...message, actions: [] });
    });

    it("rejects auto-sync payloads with mistyped data", () => {
        expect(parsePushMessage(JSON.stringify({ ...autoSyncRunMessage, data: { grantId: "grant-1" } }))).toBeNull();
        expect(
            parsePushMessage(
                JSON.stringify({
                    ...autoSyncResultMessage,
                    data: { quiet: "no", newTransactions: 1, failedConnectionCount: 0 },
                }),
            ),
        ).toBeNull();
        expect(parsePushMessage(JSON.stringify({ ...autoSyncExpiringMessage, data: { expiresAt: 1 } }))).toBeNull();
    });
});

describe("safeAppPath", () => {
    it("keeps same-origin paths and absolute URLs as path, search and hash", () => {
        expect(safeAppPath("/transactions?x=1#top", ORIGIN)).toBe("/transactions?x=1#top");
        expect(safeAppPath("https://app.test/settings", ORIGIN)).toBe("/settings");
    });

    it("sanitizes everything else to /", () => {
        expect(safeAppPath("https://evil.example/x", ORIGIN)).toBe("/");
        expect(safeAppPath("//evil.example/x", ORIGIN)).toBe("/");
        expect(safeAppPath("/\\evil.example", ORIGIN)).toBe("/");
        expect(safeAppPath("javascript:alert(1)", ORIGIN)).toBe("/");
        expect(safeAppPath(42, ORIGIN)).toBe("/");
    });
});

describe("handlePush", () => {
    it("dispatches by type to the registry handler", async () => {
        const { deps, showNotification } = fakeDeps();
        const shown = { title: "From handler", options: { body: "b", tag: "t" } };
        const handler = vi.fn<PushTypeHandler>(() => Promise.resolve(shown));
        const handlers: Record<NotificationType, PushTypeHandler> = {
            ...PUSH_TYPE_HANDLERS,
            "system.update-available": handler,
            "system.test": vi.fn<PushTypeHandler>(() => Promise.resolve(shown)),
        };

        await handlePush(JSON.stringify(updateMessage), deps, handlers);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0]?.[0]).toMatchObject({ type: "system.update-available", tag: "update-2.0" });
        expect(showNotification).toHaveBeenCalledTimes(1);
        expect(showNotification).toHaveBeenCalledWith("From handler", { ...shown.options, ...IMAGES });
    });

    it("adds the icon and monochrome badge to a custom handler that omits them", async () => {
        const { deps, showNotification } = fakeDeps();
        const handlers = {
            ...PUSH_TYPE_HANDLERS,
            "system.test": vi.fn<PushTypeHandler>(() => Promise.resolve({ title: "Custom", options: { body: "b" } })),
        };

        await handlePush(JSON.stringify(testMessage), deps, handlers);

        expect(showNotification).toHaveBeenCalledWith("Custom", expect.objectContaining(IMAGES));
    });

    it("sets the icon and badge for a known type", async () => {
        const { deps, showNotification } = fakeDeps();
        await handlePush(JSON.stringify(testMessage), deps);
        expect(showNotification.mock.calls[0]?.[1]).toMatchObject(IMAGES);
    });

    it("shows the default notification for a v1 type with the message title and body", async () => {
        const { deps, showNotification } = fakeDeps();
        await handlePush(JSON.stringify(testMessage), deps);
        expect(showNotification).toHaveBeenCalledTimes(1);
        expect(showNotification.mock.calls[0]?.[0]).toBe("Test");
        expect(showNotification.mock.calls[0]?.[1]).toMatchObject({ body: "Hello", tag: "test-1" });
    });

    it.each([
        ["unknown type", JSON.stringify({ ...testMessage, type: "nope" })],
        ["bad JSON", "{not json"],
        ["null text", null],
    ])("shows exactly one fallback for %s", async (_name, text) => {
        const { deps, showNotification } = fakeDeps();
        await handlePush(text, deps);
        expect(showNotification).toHaveBeenCalledTimes(1);
        const [title, options] = showNotification.mock.calls[0] ?? [];
        expect(title).toBe(FALLBACK_NOTIFICATION.title);
        expect(options).toMatchObject({
            body: FALLBACK_NOTIFICATION.body,
            tag: "fallback",
            data: { url: "/", actions: {} },
            ...IMAGES,
        });
    });

    it("shows a generic notification that keeps tag and url when a handler throws", async () => {
        const { deps, showNotification } = fakeDeps();
        const handlers = {
            ...PUSH_TYPE_HANDLERS,
            "system.test": vi.fn<PushTypeHandler>(() => Promise.reject(new Error("boom"))),
        };

        await handlePush(JSON.stringify({ ...testMessage, url: "/transactions" }), deps, handlers);

        expect(showNotification).toHaveBeenCalledTimes(1);
        expect(showNotification).toHaveBeenCalledWith(
            FALLBACK_NOTIFICATION.title,
            expect.objectContaining({
                body: FALLBACK_NOTIFICATION.body,
                tag: "test-1",
                data: { url: "/transactions", actions: {} },
                ...IMAGES,
            }),
        );
    });

    it("passes the tag through unchanged", async () => {
        const { deps, showNotification } = fakeDeps();
        await handlePush(JSON.stringify({ ...updateMessage, tag: "Tag With Spaces/1" }), deps);
        expect(showNotification.mock.calls[0]?.[1]).toMatchObject({ tag: "Tag With Spaces/1" });
    });

    it("maps actions to notification actions and stores their urls in data", async () => {
        const { deps, showNotification } = fakeDeps();
        await handlePush(JSON.stringify(updateMessage), deps);
        const options = showNotification.mock.calls[0]?.[1];
        expect(options?.actions).toEqual([
            { action: "upgrade-now", title: "Upgrade now" },
            { action: "how-to-upgrade", title: "How to upgrade" },
        ]);
        expect(options?.data).toEqual({
            url: "/settings",
            actions: { "upgrade-now": "/settings?upgrade=1", "how-to-upgrade": "/docs/upgrade" },
        });
    });

    it("sanitizes a cross-origin url to /", async () => {
        const { deps, showNotification } = fakeDeps();
        await handlePush(JSON.stringify({ ...updateMessage, url: "https://evil.example/phish" }), deps);
        expect(showNotification.mock.calls[0]?.[1]?.data).toMatchObject({ url: "/" });
    });

    it("sanitizes cross-origin action urls to /", async () => {
        const { deps, showNotification } = fakeDeps();
        const message = {
            ...updateMessage,
            actions: [{ id: "upgrade-now", title: "Upgrade", url: "//evil.example/x" }],
        };
        await handlePush(JSON.stringify(message), deps);
        expect(showNotification.mock.calls[0]?.[1]?.data).toEqual({
            url: "/settings",
            actions: { "upgrade-now": "/" },
        });
    });
});

describe("auto-sync handlers", () => {
    it("shows the run notification as Syncing your accounts under the auto-sync tag", async () => {
        const { deps, showNotification } = fakeDeps();
        await handlePush(JSON.stringify(autoSyncRunMessage), deps);
        expect(showNotification).toHaveBeenCalledWith(
            "Syncing your accounts…",
            expect.objectContaining({ tag: "auto-sync", ...IMAGES }),
        );
    });

    it("shows the result notification with the server title and body", async () => {
        const { deps, showNotification } = fakeDeps();
        await handlePush(JSON.stringify(autoSyncResultMessage), deps);
        expect(showNotification.mock.calls[0]?.[0]).toBe("Auto-sync finished");
        expect(showNotification.mock.calls[0]?.[1]).toMatchObject({
            body: "3 new transactions",
            tag: "auto-sync",
        });
    });

    it("shows the expiring notification with the server title and url", async () => {
        const { deps, showNotification } = fakeDeps();
        await handlePush(JSON.stringify(autoSyncExpiringMessage), deps);
        expect(showNotification.mock.calls[0]?.[0]).toBe("Auto-sync ending");
        expect(showNotification.mock.calls[0]?.[1]?.data).toEqual({ url: "/settings", actions: {} });
    });
});

describe("auto-sync run and quiet result handling", () => {
    const runUrl = "https://api.test/api/v1/bank-sync/auto-sync/run";
    const runInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ grantId: "grant-1", key: "key-1", runToken: "token-1" }),
    };
    const storedKey = { grantId: "grant-1", key: "key-1", apiBaseUrl: "https://api.test/api/v1" };
    const quietResult = {
        ...autoSyncResultMessage,
        data: { quiet: true, newTransactions: 0, failedConnectionCount: 0 },
    };

    it("shows the sync notification, then posts the run with the matching stored key", async () => {
        const { deps, showNotification, fetchMock, loadAutoSyncKey } = fakeDeps();
        loadAutoSyncKey.mockResolvedValue(storedKey);

        await handlePush(JSON.stringify(autoSyncRunMessage), deps);

        expect(showNotification).toHaveBeenCalledTimes(1);
        expect(showNotification).toHaveBeenCalledWith(
            "Syncing your accounts…",
            expect.objectContaining({ tag: "auto-sync", ...IMAGES }),
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(runUrl, runInit);
    });

    it("shows the sync notification and makes no request when no key is stored", async () => {
        const { deps, showNotification, fetchMock } = fakeDeps();

        await handlePush(JSON.stringify(autoSyncRunMessage), deps);

        expect(showNotification).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("makes no request when the stored key belongs to another grant", async () => {
        const { deps, showNotification, fetchMock, loadAutoSyncKey } = fakeDeps();
        loadAutoSyncKey.mockResolvedValue({ ...storedKey, grantId: "grant-2" });

        await handlePush(JSON.stringify(autoSyncRunMessage), deps);

        expect(showNotification).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows the sync notification before reading the key or posting the run", async () => {
        const { deps, showNotification, fetchMock, loadAutoSyncKey } = fakeDeps();
        loadAutoSyncKey.mockResolvedValue(storedKey);

        await handlePush(JSON.stringify(autoSyncRunMessage), deps);

        const shownAt = showNotification.mock.invocationCallOrder[0] ?? Infinity;
        expect(shownAt).toBeLessThan(loadAutoSyncKey.mock.invocationCallOrder[0] ?? -Infinity);
        expect(shownAt).toBeLessThan(fetchMock.mock.invocationCallOrder[0] ?? -Infinity);
    });

    it("resolves and shows nothing more when the run request rejects", async () => {
        const { deps, showNotification, fetchMock, loadAutoSyncKey } = fakeDeps();
        loadAutoSyncKey.mockResolvedValue(storedKey);
        fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));

        await expect(handlePush(JSON.stringify(autoSyncRunMessage), deps)).resolves.toBeUndefined();

        expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("does not retry a non-2xx run response", async () => {
        const { deps, showNotification, fetchMock, loadAutoSyncKey } = fakeDeps();
        loadAutoSyncKey.mockResolvedValue(storedKey);
        fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

        await handlePush(JSON.stringify(autoSyncRunMessage), deps);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("closes the auto-sync notification and shows nothing for a quiet result", async () => {
        const { deps, showNotification, closeNotifications } = fakeDeps();

        await handlePush(JSON.stringify(quietResult), deps);

        expect(closeNotifications).toHaveBeenCalledWith("auto-sync");
        expect(showNotification).not.toHaveBeenCalled();
    });

    it("does not close notifications for a non-quiet result, which shows under the auto-sync tag", async () => {
        const { deps, showNotification, closeNotifications } = fakeDeps();

        await handlePush(JSON.stringify(autoSyncResultMessage), deps);

        expect(closeNotifications).not.toHaveBeenCalled();
        expect(showNotification).toHaveBeenCalledWith(
            "Auto-sync finished",
            expect.objectContaining({ tag: "auto-sync" }),
        );
    });
});

describe("handleNotificationClick", () => {
    const target = {
        url: "/transactions",
        actions: { "upgrade-now": "/settings?upgrade=1" },
    };

    it("navigates an existing app tab to the body url and focuses it", async () => {
        const window = fakeWindow(`${ORIGIN}/settings`);
        const { clients, openWindow } = fakeClients([window]);

        await handleNotificationClick({ action: "", data: target }, { clients, origin: ORIGIN });

        expect(window.navigate).toHaveBeenCalledWith(`${ORIGIN}/transactions`);
        expect(window.focus).toHaveBeenCalledTimes(1);
        expect(openWindow).not.toHaveBeenCalled();
    });

    it("uses the action url when the action is known", async () => {
        const window = fakeWindow(`${ORIGIN}/`);
        const { clients } = fakeClients([window]);

        await handleNotificationClick({ action: "upgrade-now", data: target }, { clients, origin: ORIGIN });

        expect(window.navigate).toHaveBeenCalledWith(`${ORIGIN}/settings?upgrade=1`);
    });

    it("falls back to the body url for an unknown action", async () => {
        const window = fakeWindow(`${ORIGIN}/`);
        const { clients } = fakeClients([window]);

        await handleNotificationClick({ action: "not-an-action", data: target }, { clients, origin: ORIGIN });

        expect(window.navigate).toHaveBeenCalledWith(`${ORIGIN}/transactions`);
    });

    it("routes to / when the stored data is malformed", async () => {
        const window = fakeWindow(`${ORIGIN}/`);
        const { clients } = fakeClients([window]);

        await handleNotificationClick({ action: "", data: "garbage" }, { clients, origin: ORIGIN });

        expect(window.navigate).toHaveBeenCalledWith(`${ORIGIN}/`);
    });

    it("still navigates when focus rejects", async () => {
        const window = fakeWindow(`${ORIGIN}/`, {
            focus: vi.fn<() => Promise<unknown>>(() => Promise.reject(new Error("no user activation"))),
        });
        const { clients, openWindow } = fakeClients([window]);

        await handleNotificationClick({ action: "", data: target }, { clients, origin: ORIGIN });

        expect(window.navigate).toHaveBeenCalledWith(`${ORIGIN}/transactions`);
        expect(openWindow).not.toHaveBeenCalled();
    });

    it("requests focus before navigating, so a slow page load cannot outlive the tap's focus allowance", async () => {
        const window = fakeWindow(`${ORIGIN}/`);
        const { clients } = fakeClients([window]);

        await handleNotificationClick({ action: "", data: target }, { clients, origin: ORIGIN });

        const focusCall = window.focus.mock.invocationCallOrder[0] ?? Infinity;
        const navigateCall = window.navigate.mock.invocationCallOrder[0] ?? -Infinity;
        expect(focusCall).toBeLessThan(navigateCall);
    });

    it("prefers the focused app tab over an unfocused one", async () => {
        const background = fakeWindow(`${ORIGIN}/a`);
        const focused = fakeWindow(`${ORIGIN}/b`, { focused: true });
        const { clients, openWindow } = fakeClients([background, focused]);

        await handleNotificationClick({ action: "", data: target }, { clients, origin: ORIGIN });

        expect(focused.navigate).toHaveBeenCalledWith(`${ORIGIN}/transactions`);
        expect(background.navigate).not.toHaveBeenCalled();
        expect(openWindow).not.toHaveBeenCalled();
    });

    it("ignores tabs from other origins", async () => {
        const other = fakeWindow("https://evil.example/", { focused: true });
        const { clients, openWindow } = fakeClients([other]);

        await handleNotificationClick({ action: "", data: target }, { clients, origin: ORIGIN });

        expect(other.navigate).not.toHaveBeenCalled();
        expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/transactions`);
    });

    it("opens a new window when no app tab exists", async () => {
        const { clients, openWindow } = fakeClients([]);

        await handleNotificationClick({ action: "", data: target }, { clients, origin: ORIGIN });

        expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/transactions`);
    });

    it("opens a new window when navigating the existing tab rejects", async () => {
        const window = fakeWindow(`${ORIGIN}/`, {
            navigate: vi.fn<(url: string) => Promise<unknown>>(() => Promise.reject(new Error("gone"))),
        });
        const { clients, openWindow } = fakeClients([window]);

        await handleNotificationClick({ action: "", data: target }, { clients, origin: ORIGIN });

        expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/transactions`);
    });

    it("ignores a rejected openWindow", async () => {
        const { clients, openWindow } = fakeClients([]);
        openWindow.mockImplementation(() => Promise.reject(new Error("blocked")));

        await expect(
            handleNotificationClick({ action: "", data: target }, { clients, origin: ORIGIN }),
        ).resolves.toBeUndefined();
    });
});
