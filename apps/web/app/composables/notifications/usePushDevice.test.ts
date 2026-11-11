import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toBase64Url } from "~/utils/base64url";
import { usePushDevice } from "./usePushDevice";

const { auth, api, queryClient } = vi.hoisted(() => ({
    auth: { user: { id: "u1" } as { id: string } | null },
    api: {
        getVapidPublicKey: vi.fn(),
        registerPushSubscription: vi.fn(),
        unregisterPushSubscription: vi.fn(),
    },
    queryClient: {
        fetchQuery: vi.fn(),
        invalidateQueries: vi.fn(),
    },
}));

vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => queryClient }));
vi.mock("../useApiClient", () => ({ useApiClient: () => api }));
vi.mock("~/stores/auth", () => ({ useAuthStore: () => auth }));

const PUBLIC_KEY = toBase64Url(new Uint8Array([4, 7, 7, 7]));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0";

function fakeSubscription(endpoint = "https://push.example/sub") {
    return {
        endpoint,
        options: { applicationServerKey: null as ArrayBuffer | null },
        toJSON: () => ({ keys: { p256dh: "p256", auth: "auth" } }),
        unsubscribe: vi.fn(() => Promise.resolve(true)),
    };
}

// Installs a supported browser with the given permission and registration state.
function installBrowser(opts: {
    permission?: NotificationPermission;
    requestPermission?: NotificationPermission;
    registration?: ReturnType<typeof fakeRegistration> | null;
    serviceWorker?: boolean;
}) {
    const registration = opts.registration === undefined ? fakeRegistration() : opts.registration;
    const navigatorStub = {
        userAgent: UA,
        maxTouchPoints: 0,
        ...(opts.serviceWorker === false
            ? {}
            : { serviceWorker: { getRegistration: vi.fn(() => Promise.resolve(registration ?? undefined)) } }),
    };
    vi.stubGlobal("navigator", navigatorStub);
    vi.stubGlobal("window", {
        PushManager: {},
        matchMedia: () => ({ matches: false }),
    });
    let permission: NotificationPermission = opts.permission ?? "default";
    const notification = {
        get permission() {
            return permission;
        },
        requestPermission: vi.fn(() => {
            permission = opts.requestPermission ?? "granted";
            return Promise.resolve(permission);
        }),
    };
    vi.stubGlobal("Notification", notification);
    return { registration, notification };
}

function fakeRegistration(subscriptions: (ReturnType<typeof fakeSubscription> | null)[] = [null]) {
    const getSubscription = vi.fn();
    subscriptions.forEach((value) => getSubscription.mockResolvedValueOnce(value));
    getSubscription.mockResolvedValue(subscriptions[subscriptions.length - 1] ?? null);
    const created = fakeSubscription("https://push.example/new");
    return {
        pushManager: {
            getSubscription,
            subscribe: vi.fn(() => Promise.resolve(created)),
        },
        created,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: "u1" };
    queryClient.fetchQuery.mockResolvedValue({ publicKey: PUBLIC_KEY });
    queryClient.invalidateQueries.mockResolvedValue(undefined);
    api.registerPushSubscription.mockResolvedValue({});
    api.unregisterPushSubscription.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("usePushDevice.refresh", () => {
    it("reports unsupported when no service worker is registered", async () => {
        installBrowser({ serviceWorker: false });
        const device = usePushDevice();
        await device.refresh();
        expect(device.state.value).toBe("unsupported");
    });

    it("reports off for a granted permission without a subscription", async () => {
        installBrowser({ permission: "granted", registration: fakeRegistration([null]) });
        const device = usePushDevice();
        await device.refresh();
        expect(device.state.value).toBe("off");
        expect(device.endpoint.value).toBeNull();
    });

    it("reports on and exposes this browser's endpoint when subscribed", async () => {
        installBrowser({ permission: "granted", registration: fakeRegistration([fakeSubscription()]) });
        const device = usePushDevice();
        await device.refresh();
        expect(device.state.value).toBe("on");
        expect(device.endpoint.value).toBe("https://push.example/sub");
    });

    it("leaves loading and keeps the error when the registration read throws", async () => {
        installBrowser({ permission: "granted" });
        vi.mocked(navigator.serviceWorker.getRegistration).mockRejectedValueOnce(new Error("blocked"));
        const device = usePushDevice();
        await device.refresh();
        expect(device.state.value).toBe("unsupported");
        expect(device.error.value?.message).toBe("blocked");
    });
});

describe("usePushDevice.enable", () => {
    it("does not subscribe or register when the permission is denied", async () => {
        const registration = fakeRegistration([null]);
        installBrowser({ permission: "default", requestPermission: "denied", registration });
        const device = usePushDevice();

        await device.enable();

        expect(device.state.value).toBe("denied");
        expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
        expect(api.registerPushSubscription).not.toHaveBeenCalled();
    });

    it("subscribes with the VAPID key, registers this device and refreshes the subscriptions list", async () => {
        const registration = fakeRegistration([null, fakeSubscription("https://push.example/new")]);
        installBrowser({ permission: "default", requestPermission: "granted", registration });
        const device = usePushDevice();

        await device.enable();

        expect(queryClient.fetchQuery).toHaveBeenCalledWith(expect.objectContaining({ staleTime: Infinity }));
        expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({ userVisibleOnly: true }),
        );
        expect(api.registerPushSubscription).toHaveBeenCalledWith({
            endpoint: "https://push.example/new",
            keys: { p256dh: "p256", auth: "auth" },
            deviceLabel: "Chrome on Windows",
        });
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ["notifications", "subscriptions", "u1"],
        });
        expect(device.error.value).toBeNull();
    });

    it("surfaces a failed registration as an error without throwing", async () => {
        installBrowser({
            permission: "granted",
            registration: fakeRegistration([null, null]),
        });
        api.registerPushSubscription.mockRejectedValueOnce(new Error("server down"));
        const device = usePushDevice();

        await expect(device.enable()).resolves.toBeUndefined();

        expect(device.error.value?.message).toBe("server down");
        expect(device.busy.value).toBe(false);
    });
});

describe("usePushDevice.disable", () => {
    it("unregisters the endpoint on the API before unsubscribing the browser", async () => {
        const subscription = fakeSubscription();
        installBrowser({ permission: "granted", registration: fakeRegistration([subscription, null]) });
        const order: string[] = [];
        api.unregisterPushSubscription.mockImplementation(() => {
            order.push("api");
            return Promise.resolve();
        });
        subscription.unsubscribe.mockImplementation(() => {
            order.push("unsubscribe");
            return Promise.resolve(true);
        });
        const device = usePushDevice();

        await device.disable();

        expect(api.unregisterPushSubscription).toHaveBeenCalledWith("https://push.example/sub");
        expect(order).toEqual(["api", "unsubscribe"]);
        expect(device.state.value).toBe("off");
    });
});
