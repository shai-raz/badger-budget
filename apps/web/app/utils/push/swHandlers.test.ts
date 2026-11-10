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

function fakeDeps() {
    const showNotification = vi.fn<(title: string, options: ShowOptions) => Promise<void>>(() => Promise.resolve());
    const deps: PushDeps & { origin: string } = {
        showNotification,
        fetch: vi.fn<typeof fetch>(),
        origin: ORIGIN,
    };
    return { deps, showNotification };
}

interface FakeWindow extends SwWindowClient {
    navigate: Mock<(url: string) => Promise<unknown>>;
    focus: Mock<() => Promise<unknown>>;
}

function fakeWindow(url: string, overrides: Partial<FakeWindow> = {}): FakeWindow {
    return {
        url,
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
            "system.update-available": handler,
            "system.test": vi.fn<PushTypeHandler>(() => Promise.resolve(shown)),
        };

        await handlePush(JSON.stringify(updateMessage), deps, handlers);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0]?.[0]).toMatchObject({ type: "system.update-available", tag: "update-2.0" });
        expect(showNotification).toHaveBeenCalledTimes(1);
        expect(showNotification).toHaveBeenCalledWith("From handler", shown.options);
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
