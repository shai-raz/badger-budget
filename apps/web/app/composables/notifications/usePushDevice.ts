import { ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "../useApiClient";
import { useAuthStore } from "~/stores/auth";
import {
    isIosDevice,
    isStandaloneDisplay,
    resolvePushDeviceState,
    type PushDeviceState,
    type PushEnvironment,
} from "~/utils/push/pushState";
import { enablePushSubscription } from "~/utils/push/pushSync";
import { getPushRegistration } from "~/utils/push/pushDeps";
import { notificationKeys, vapidPublicKeyOptions } from "./useNotificationQueries";

function readEnvironment(): PushEnvironment {
    const navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
    return {
        hasServiceWorker: "serviceWorker" in navigator,
        hasPushManager: "PushManager" in window,
        hasNotification: typeof Notification !== "undefined",
        isIos: isIosDevice(navigator.userAgent, navigator.maxTouchPoints),
        isStandalone: isStandaloneDisplay(window.matchMedia("(display-mode: standalone)").matches, navigatorStandalone),
    };
}

function toError(e: unknown): Error {
    return e instanceof Error ? e : new Error(String(e));
}

export function usePushDevice() {
    const apiClient = useApiClient();
    const authStore = useAuthStore();
    const queryClient = useQueryClient();

    const state = ref<PushDeviceState | "loading">("loading");
    const endpoint = ref<string | null>(null);
    const busy = ref(false);
    const error = ref<Error | null>(null);

    const device = () => ({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
    const invalidateSubscriptions = () =>
        queryClient.invalidateQueries({ queryKey: notificationKeys.subscriptions(authStore.user?.id) });

    async function readState() {
        const registration = await getPushRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        endpoint.value = subscription?.endpoint ?? null;
        const env = readEnvironment();
        const permission = env.hasNotification ? Notification.permission : null;
        state.value = resolvePushDeviceState(
            { ...env, hasServiceWorker: env.hasServiceWorker && !!registration },
            permission,
            !!subscription,
        );
    }

    async function refresh() {
        try {
            await readState();
        } catch (e) {
            error.value = toError(e);
            // Without this the band would keep its skeleton: no state means nothing to show but the error.
            if (state.value === "loading") state.value = "unsupported";
        }
    }

    async function withBusy(action: () => Promise<void>) {
        busy.value = true;
        error.value = null;
        try {
            await action();
        } catch (e) {
            error.value = toError(e);
        } finally {
            await refresh();
            busy.value = false;
        }
    }

    // Must be called from a tap handler: requestPermission needs user activation, so nothing awaits before it.
    async function enable() {
        await withBusy(async () => {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") return;

            const registration = await getPushRegistration();
            if (!registration) throw new Error("Push is not available in this browser");
            const { publicKey } = await queryClient.fetchQuery(vapidPublicKeyOptions(apiClient));
            await enablePushSubscription({
                registration,
                publicKey,
                register: (data) => apiClient.registerPushSubscription(data),
                device: device(),
            });
            await invalidateSubscriptions();
        });
    }

    async function disable() {
        await withBusy(async () => {
            const registration = await getPushRegistration();
            const subscription = await registration?.pushManager.getSubscription();
            if (!subscription) return;
            await apiClient.unregisterPushSubscription(subscription.endpoint);
            await subscription.unsubscribe();
            await invalidateSubscriptions();
        });
    }

    return { state, endpoint, busy, error, refresh, enable, disable };
}
