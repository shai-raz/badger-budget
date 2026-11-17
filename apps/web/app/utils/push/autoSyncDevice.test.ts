import { describe, expect, it, vi } from "vitest";
import type { IMoveAutoSyncDevice } from "@badger/types";
import {
    handleSubscriptionChange,
    syncAutoSyncDevice,
    type DeviceSubscriptionLike,
    type SubscriptionChangeDeps,
} from "./autoSyncDevice";
import type { AutoSyncKeyRecord } from "./autoSyncKeyStore";

const RECORD: AutoSyncKeyRecord = { grantId: "grant-1", key: "k".repeat(43), apiBaseUrl: "https://app.test/api/v1" };
const OLD_KEY = new Uint8Array([4, 1, 2, 3]).buffer;

function fakeSubscription(endpoint: string, keys: Record<string, string> = { p256dh: "p", auth: "a" }) {
    return {
        endpoint,
        options: { applicationServerKey: OLD_KEY },
        toJSON: () => ({ keys }),
    } satisfies DeviceSubscriptionLike;
}

const moveBody = (endpoint: string): IMoveAutoSyncDevice => ({
    grantId: RECORD.grantId,
    key: RECORD.key,
    endpoint,
    keys: { p256dh: "p", auth: "a" },
});

describe("syncAutoSyncDevice", () => {
    const deps = (record: AutoSyncKeyRecord | null, subscription: DeviceSubscriptionLike | null) => ({
        getSubscription: vi.fn(() => Promise.resolve(subscription)),
        loadAutoSyncKey: vi.fn(() => Promise.resolve(record)),
        move: vi.fn((_body: IMoveAutoSyncDevice) => Promise.resolve()),
    });

    it("moves the grant to this browser's current subscription", async () => {
        const d = deps(RECORD, fakeSubscription("https://push.example/new"));

        await syncAutoSyncDevice(d);

        expect(d.move).toHaveBeenCalledWith(moveBody("https://push.example/new"));
    });

    it.each([
        ["holds no auto-sync key", null, fakeSubscription("https://push.example/new")],
        ["has no subscription", RECORD, null],
        ["has a subscription without keys", RECORD, fakeSubscription("https://push.example/new", {})],
    ])("does nothing when this browser %s", async (_label, record, subscription) => {
        const d = deps(record, subscription);

        await syncAutoSyncDevice(d);

        expect(d.move).not.toHaveBeenCalled();
    });
});

describe("handleSubscriptionChange", () => {
    function fakeDeps(record: AutoSyncKeyRecord | null, current: DeviceSubscriptionLike | null = null) {
        const resubscribed = fakeSubscription("https://push.example/resubscribed");
        const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));
        const deps = {
            pushManager: {
                getSubscription: vi.fn(() => Promise.resolve(current)),
                subscribe: vi.fn(() => Promise.resolve(resubscribed)),
            },
            loadAutoSyncKey: vi.fn(() => Promise.resolve(record)),
            fetch: fetchMock,
        } satisfies SubscriptionChangeDeps;
        return { deps, fetchMock };
    }

    const sentBody = (fetchMock: ReturnType<typeof fakeDeps>["fetchMock"]) =>
        JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as IMoveAutoSyncDevice;

    it("posts the browser's new subscription to the device route with the device key", async () => {
        const { deps, fetchMock } = fakeDeps(RECORD);

        await handleSubscriptionChange(
            {
                oldSubscription: fakeSubscription("https://push.example/old"),
                newSubscription: fakeSubscription("https://push.example/new"),
            },
            deps,
        );

        expect(fetchMock).toHaveBeenCalledWith(
            "https://app.test/api/v1/bank-sync/auto-sync/device",
            expect.objectContaining({ method: "POST", credentials: "omit" }),
        );
        expect(sentBody(fetchMock)).toEqual(moveBody("https://push.example/new"));
        expect(deps.pushManager.subscribe).not.toHaveBeenCalled();
    });

    it("subscribes again with the old subscription's key when the browser gave no new one", async () => {
        const { deps, fetchMock } = fakeDeps(RECORD);

        await handleSubscriptionChange(
            { oldSubscription: fakeSubscription("https://push.example/old"), newSubscription: null },
            deps,
        );

        expect(deps.pushManager.subscribe).toHaveBeenCalledWith({
            userVisibleOnly: true,
            applicationServerKey: OLD_KEY,
        });
        expect(sentBody(fetchMock)).toEqual(moveBody("https://push.example/resubscribed"));
    });

    it("uses a subscription the browser already holds before subscribing again", async () => {
        const { deps, fetchMock } = fakeDeps(RECORD, fakeSubscription("https://push.example/current"));

        await handleSubscriptionChange({ oldSubscription: null, newSubscription: null }, deps);

        expect(deps.pushManager.subscribe).not.toHaveBeenCalled();
        expect(sentBody(fetchMock)).toEqual(moveBody("https://push.example/current"));
    });

    it("gives up when there is neither a new subscription nor an old key", async () => {
        const { deps, fetchMock } = fakeDeps(RECORD);

        await handleSubscriptionChange({ oldSubscription: null, newSubscription: null }, deps);

        expect(deps.pushManager.subscribe).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("still resubscribes, but calls no API, when this browser holds no auto-sync key", async () => {
        const { deps, fetchMock } = fakeDeps(null);

        await handleSubscriptionChange(
            { oldSubscription: fakeSubscription("https://push.example/old"), newSubscription: null },
            deps,
        );

        expect(deps.pushManager.subscribe).toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
