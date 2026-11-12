import { describe, expect, it, vi } from "vitest";
import {
    AUTO_SYNC_TAG,
    closeTaggedNotifications,
    watchAutoSyncNotices,
    type NotificationRegistrationLike,
} from "./autoSyncNotices";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeDoc(visibilityState: string) {
    const listeners = new Set<() => void>();
    const doc = {
        visibilityState,
        addEventListener: vi.fn((_type: "visibilitychange", listener: () => void) => {
            listeners.add(listener);
        }),
        removeEventListener: vi.fn((_type: "visibilitychange", listener: () => void) => {
            listeners.delete(listener);
        }),
    };
    return {
        doc,
        listeners,
        change(state: string) {
            doc.visibilityState = state;
            for (const listener of [...listeners]) listener();
        },
    };
}

function fakeRegistration(count = 2) {
    const notifications = Array.from({ length: count }, () => ({ close: vi.fn() }));
    const getNotifications = vi.fn((_filter: { tag: string }) => Promise.resolve(notifications));
    const registration: NotificationRegistrationLike = { getNotifications };
    return { registration, getNotifications, notifications };
}

describe("closeTaggedNotifications", () => {
    it("closes every notification matching the tag", async () => {
        const { registration, getNotifications, notifications } = fakeRegistration();

        await closeTaggedNotifications(registration, AUTO_SYNC_TAG);

        expect(getNotifications).toHaveBeenCalledWith({ tag: "auto-sync" });
        for (const notification of notifications) expect(notification.close).toHaveBeenCalledTimes(1);
    });

    it("filters by the tag it is given", async () => {
        const { registration, getNotifications } = fakeRegistration(0);

        await closeTaggedNotifications(registration, "other-tag");

        expect(getNotifications).toHaveBeenCalledWith({ tag: "other-tag" });
    });

    it("does nothing without a registration", async () => {
        await expect(closeTaggedNotifications(undefined, AUTO_SYNC_TAG)).resolves.toBeUndefined();
    });

    it("does nothing when the registration cannot list notifications", async () => {
        await expect(closeTaggedNotifications({}, AUTO_SYNC_TAG)).resolves.toBeUndefined();
    });
});

describe("watchAutoSyncNotices", () => {
    it("closes tagged notices when the watch starts", async () => {
        const page = fakeDoc("hidden");
        const { registration, getNotifications, notifications } = fakeRegistration();

        watchAutoSyncNotices(page.doc, () => Promise.resolve(registration));
        await flush();

        expect(getNotifications).toHaveBeenCalledWith({ tag: AUTO_SYNC_TAG });
        for (const notification of notifications) expect(notification.close).toHaveBeenCalledTimes(1);
    });

    it("closes them again when the page becomes visible", async () => {
        const page = fakeDoc("hidden");
        const { registration, getNotifications } = fakeRegistration();
        watchAutoSyncNotices(page.doc, () => Promise.resolve(registration));
        await flush();

        page.change("visible");
        await flush();

        expect(getNotifications).toHaveBeenCalledTimes(2);
    });

    it("does nothing when the page becomes hidden", async () => {
        const page = fakeDoc("visible");
        const { registration, getNotifications } = fakeRegistration();
        watchAutoSyncNotices(page.doc, () => Promise.resolve(registration));
        await flush();

        page.change("hidden");
        await flush();

        expect(getNotifications).toHaveBeenCalledTimes(1);
    });

    it("does nothing without a registration", async () => {
        const page = fakeDoc("visible");

        watchAutoSyncNotices(page.doc, () => Promise.resolve(undefined));

        await expect(flush()).resolves.toBeUndefined();
    });

    it("swallows a rejecting getNotifications", async () => {
        const page = fakeDoc("visible");
        const registration: NotificationRegistrationLike = {
            getNotifications: () => Promise.reject(new Error("no notifications")),
        };

        watchAutoSyncNotices(page.doc, () => Promise.resolve(registration));
        page.change("visible");
        await flush();

        expect(page.listeners.size).toBe(1);
    });

    it("swallows a rejecting or throwing getRegistration", async () => {
        const page = fakeDoc("visible");

        watchAutoSyncNotices(page.doc, () => {
            throw new Error("no service worker");
        });
        watchAutoSyncNotices(page.doc, () => Promise.reject(new Error("no service worker")));
        await flush();

        expect(page.listeners.size).toBe(2);
    });

    it("the cleanup removes the listener", async () => {
        const page = fakeDoc("visible");
        const { registration, getNotifications } = fakeRegistration();
        const cleanup = watchAutoSyncNotices(page.doc, () => Promise.resolve(registration));
        await flush();

        cleanup();
        page.change("visible");
        await flush();

        expect(page.doc.removeEventListener).toHaveBeenCalledTimes(1);
        expect(page.listeners.size).toBe(0);
        expect(getNotifications).toHaveBeenCalledTimes(1);
    });
});
