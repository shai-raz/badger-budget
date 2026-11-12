<script setup lang="ts">
import type { IPushSubscription, INotificationPreference } from "@badger/types";
import type { MenuItem } from "primevue/menuitem";
import { useToast } from "primevue/usetoast";
import { AUTO_SYNC_SETTINGS_TYPE } from "@badger/shared-data";
import { useApiClient } from "../../composables/useApiClient";
import { useDevtoolsFlag } from "../../composables/useDevtoolsFlag";
import {
    useDeletePushSubscriptionMutation,
    useNotificationPreferencesQuery,
    usePushSubscriptionsQuery,
    useSendTestNotificationMutation,
    useUpdateNotificationPreferencesMutation,
} from "../../composables/notifications/useNotificationQueries";
import { usePushDevice } from "../../composables/notifications/usePushDevice";
import { useAuthStore } from "~/stores/auth";
import { describeDevice } from "~/utils/deviceLabel";
import { getApiErrorMessage } from "~/utils/apiError";
import { formatTimeAgo } from "~/utils/relativeTime";
import type { PushDeviceState } from "~/utils/push/pushState";

definePageMeta({
    layout: "app",
    fullBleed: true,
});

const PUSH_LINES: Record<PushDeviceState | "loading", string> = {
    loading: "",
    on: "You get notifications even when Badger is closed.",
    off: "Turn on to get notifications even when Badger is closed.",
    denied: "Blocked by your browser.",
    unsupported: "Not supported in this browser.",
    "ios-install": "Needs the app on your Home Screen.",
};

const toast = useToast();
const authStore = useAuthStore();
const isDemo = computed(() => authStore.user?.isDemo === true);
const devtoolsEnabled = useDevtoolsFlag();

const device = usePushDevice();
const deviceState = computed(() => device.state.value);
const deviceError = computed(() => device.error.value);
const canToggle = computed(() => !isDemo.value && (deviceState.value === "on" || deviceState.value === "off"));
const pushLine = computed(() => (isDemo.value ? "Not available on the demo account." : PUSH_LINES[deviceState.value]));
const thisDeviceMeta = computed(() =>
    deviceState.value === "unsupported" ? undefined : describeDevice(navigator.userAgent, navigator.maxTouchPoints),
);

const { data: subscriptions, isLoading: subscriptionsLoading, error: subscriptionsError } = usePushSubscriptionsQuery();
const { data: preferences, isLoading: preferencesLoading, error: preferencesError } = useNotificationPreferencesQuery();
const updatePreferences = useUpdateNotificationPreferencesMutation();
const removeSubscription = useDeletePushSubscriptionMutation();
const sendTest = useSendTestNotificationMutation();
const apiClient = useApiClient();
const autoSyncOn = ref(false);

const devices = computed(() => subscriptions.value ?? []);
// The Auto-sync entry is only shown while auto-sync is on.
const preferenceRows = computed(() =>
    (preferences.value ?? []).filter((pref) => pref.type !== AUTO_SYNC_SETTINGS_TYPE || autoSyncOn.value),
);
const deviceCountLabel = computed(() => {
    const count = devices.value.length;
    if (count === 0) return "None";
    return count === 1 ? "1 device" : `${count} devices`;
});

onMounted(() => {
    void device.refresh();
    // The Auto-sync entry is only shown while auto-sync is on.
    apiClient
        .getAutoSync()
        .then((state) => {
            autoSyncOn.value = state.autoSync !== null;
        })
        .catch(() => {
            autoSyncOn.value = false;
        });
});

const isThisDevice = (subscription: IPushSubscription) =>
    device.endpoint.value !== null && subscription.endpoint === device.endpoint.value;

const lastNotificationLabel = (subscription: IPushSubscription) =>
    subscription.lastAcceptedAt
        ? `Last notification ${formatTimeAgo(subscription.lastAcceptedAt)}`
        : "No notifications yet";

// Phone and tablet names come from the registered device label, which describeDevice builds.
const isPhoneLabel = (label: string) => /iPhone|iPad|Android/.test(label);

// A 429 from the test endpoint is the throttle, which needs its own message.
const isTooManyRequests = (error: unknown) =>
    (error as { response?: { status?: number } } | null)?.response?.status === 429;

// PrimeVue's switch flips itself on click and only resyncs when its bound value changes. Binding the pending value
// until the attempt settles means a dismissed, blocked or failed attempt always moves the switch back.
const pendingPreferences = ref<Partial<Record<INotificationPreference["type"], boolean>>>({});
const preferenceOn = (pref: INotificationPreference) => pendingPreferences.value[pref.type] ?? pref.enabled;

function setPreference(type: INotificationPreference["type"], enabled: boolean) {
    pendingPreferences.value = { ...pendingPreferences.value, [type]: enabled };
    updatePreferences.mutate(
        { preferences: [{ type, enabled }] },
        {
            onError: (error) =>
                toast.add({
                    severity: "error",
                    summary: "Error",
                    detail: getApiErrorMessage(error, "Couldn't update notifications"),
                    life: 5000,
                }),
            onSettled: () => {
                pendingPreferences.value = Object.fromEntries(
                    Object.entries(pendingPreferences.value).filter(([key]) => key !== type),
                );
            },
        },
    );
}

const pendingPush = ref<boolean | null>(null);
const pushOn = computed(() => pendingPush.value ?? deviceState.value === "on");

async function setThisDevicePush(on: boolean) {
    pendingPush.value = on;
    try {
        if (on) await device.enable();
        else await device.disable();
    } finally {
        pendingPush.value = null;
    }
}

async function removeDevice(subscription: IPushSubscription) {
    const wasThisDevice = isThisDevice(subscription);
    try {
        await removeSubscription.mutateAsync(subscription.id);
    } catch (error) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: getApiErrorMessage(error, "Couldn't remove the device"),
            life: 5000,
        });
        return;
    }
    // The server row is gone; this also unsubscribes the browser so it stops receiving pushes.
    if (wasThisDevice) await device.disable();
}

// One ⋮ menu for the device list, pointed at the row it was opened from.
const menu = ref();
const selectedDevice = ref<IPushSubscription | null>(null);
const deviceMenuItems = computed<MenuItem[]>(() => [
    {
        label: "Remove device",
        icon: "pi pi-trash",
        class: "text-red-500",
        command: () => {
            if (selectedDevice.value) void removeDevice(selectedDevice.value);
        },
    },
]);

function openDeviceMenu(event: Event, subscription: IPushSubscription) {
    selectedDevice.value = subscription;
    menu.value?.toggle(event);
}

// Result of the last test send, shown inline under the button rather than as a toast.
const testSent = ref<number | null>(null);
const testDisabled = computed(() => isDemo.value || devices.value.length === 0);
const testLine = computed(() =>
    testSent.value === null
        ? "Goes to every device listed above."
        : `Sent to ${testSent.value} ${testSent.value === 1 ? "device" : "devices"}. Check your notifications.`,
);

function sendTestNotification() {
    sendTest.mutate(undefined, {
        onSuccess: ({ sent }) => {
            testSent.value = sent;
        },
        onError: (error) =>
            toast.add({
                severity: "error",
                summary: "Error",
                detail: isTooManyRequests(error)
                    ? "Too many test notifications, try again in a minute"
                    : getApiErrorMessage(error, "Couldn't send the test notification"),
                life: 5000,
            }),
    });
}
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader
            title="Notifications"
            back-to="/settings"
        />

        <SharedSectionBand
            title="This device"
            heading-id="this-device-heading"
            :meta="thisDeviceMeta"
            :loading="deviceState === 'loading'"
        >
            <div class="flex flex-col gap-3 px-4 pb-4 md:px-0 md:pb-0">
                <div class="flex items-center gap-3">
                    <i
                        class="pi pi-bell text-muted-color"
                        aria-hidden="true"
                    />
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <label
                            for="push-notifications"
                            class="text-sm font-semibold"
                        >
                            Push notifications
                        </label>
                        <span class="text-xs text-muted-color">{{ pushLine }}</span>
                    </div>
                    <ToggleSwitch
                        input-id="push-notifications"
                        :model-value="pushOn"
                        :disabled="!canToggle || device.busy.value"
                        class="shrink-0"
                        @update:model-value="(value) => setThisDevicePush(value === true)"
                    />
                </div>

                <Message
                    v-if="isDemo"
                    severity="info"
                    :closable="false"
                >
                    Notifications aren't available on the demo account.
                </Message>
                <Message
                    v-else-if="deviceState === 'denied'"
                    severity="warn"
                    :closable="false"
                >
                    <div class="flex flex-col gap-1">
                        <span class="font-semibold">Notifications are blocked for this site</span>
                        <span
                            >Allow notifications for Badger in your browser's site settings, then reload this
                            page.</span
                        >
                    </div>
                </Message>
                <Message
                    v-else-if="deviceState === 'ios-install'"
                    severity="info"
                    :closable="false"
                >
                    <div class="flex flex-col gap-1.5">
                        <span class="font-semibold">Add Badger to your Home Screen first</span>
                        <span
                            >On iPhone and iPad, notifications only work in the installed app (iOS 16.4 or later).</span
                        >
                        <ol class="list-decimal pl-5">
                            <li>In Safari, tap the Share button.</li>
                            <li>Choose Add to Home Screen.</li>
                            <li>Open Badger from the new icon and come back here.</li>
                        </ol>
                    </div>
                </Message>
                <p
                    v-else-if="deviceState === 'unsupported'"
                    class="text-sm text-muted-color"
                >
                    This browser can't receive push notifications. Open Badger in Chrome, Edge, Firefox or Safari to
                    turn them on.
                </p>

                <Message
                    v-if="deviceError"
                    severity="error"
                    :closable="false"
                >
                    Couldn't update notifications on this device.
                </Message>
            </div>
        </SharedSectionBand>

        <SharedSectionBand
            title="Notification types"
            heading-id="notify-heading"
            meta="For all your devices"
            :loading="preferencesLoading"
            :error="preferencesError"
            :empty="!preferencesLoading && !preferenceRows.length"
            empty-text="There are no notifications for your account yet. New ones will show up here."
        >
            <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
                <div
                    v-for="pref in preferenceRows"
                    :key="pref.type"
                    class="flex items-center gap-3 px-4 py-3 md:px-0"
                >
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <label
                            :for="`notify-${pref.type}`"
                            class="text-sm font-semibold"
                        >
                            {{ pref.label }}
                        </label>
                        <span class="text-xs text-muted-color">{{ pref.description }}</span>
                    </div>
                    <span
                        v-if="pref.mandatory"
                        class="shrink-0 text-xs text-muted-color"
                    >
                        Always on
                    </span>
                    <ToggleSwitch
                        :input-id="`notify-${pref.type}`"
                        :model-value="pref.mandatory || preferenceOn(pref)"
                        :disabled="pref.mandatory || isDemo || updatePreferences.isPending.value"
                        class="shrink-0"
                        @update:model-value="(value) => setPreference(pref.type, value === true)"
                    />
                </div>
            </div>
        </SharedSectionBand>

        <SharedSectionBand
            title="Devices"
            heading-id="devices-heading"
            :meta="subscriptionsLoading ? undefined : deviceCountLabel"
            :loading="subscriptionsLoading"
            :error="subscriptionsError"
            :empty="!subscriptionsLoading && !devices.length"
            empty-text="No devices get notifications yet. Turn on push notifications above to add this one."
        >
            <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
                <div
                    v-for="subscription in devices"
                    :key="subscription.id"
                    class="flex items-center gap-3 px-4 py-3 md:px-0"
                >
                    <i
                        :class="isPhoneLabel(subscription.deviceLabel) ? 'pi pi-mobile' : 'pi pi-desktop'"
                        class="text-muted-color"
                        aria-hidden="true"
                    />
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <div class="flex min-w-0 items-center gap-2">
                            <span class="truncate text-sm font-semibold">{{ subscription.deviceLabel }}</span>
                            <SharedStatusTag
                                v-if="isThisDevice(subscription)"
                                value="This device"
                            />
                        </div>
                        <span class="text-xs text-muted-color">{{ lastNotificationLabel(subscription) }}</span>
                    </div>
                    <Button
                        icon="pi pi-ellipsis-v"
                        text
                        rounded
                        size="small"
                        aria-haspopup="menu"
                        :aria-label="`Actions for ${subscription.deviceLabel}`"
                        :disabled="isDemo || removeSubscription.isPending.value"
                        class="shrink-0 text-muted-color"
                        @click="openDeviceMenu($event, subscription)"
                    />
                </div>
            </div>
            <Menu
                ref="menu"
                :model="deviceMenuItems"
                popup
            />
        </SharedSectionBand>

        <SharedSectionBand
            v-if="devtoolsEnabled"
            title="Developer options"
            heading-id="developer-heading"
            meta="Only in this browser"
        >
            <div class="flex items-center gap-3 px-4 pb-4 md:px-0 md:pb-0">
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <span class="text-sm font-semibold">Send a test notification</span>
                    <span class="text-xs text-muted-color">{{ testLine }}</span>
                </div>
                <Button
                    label="Send test"
                    severity="secondary"
                    outlined
                    size="small"
                    class="shrink-0"
                    :disabled="testDisabled || sendTest.isPending.value"
                    :loading="sendTest.isPending.value"
                    @click="sendTestNotification"
                />
            </div>
        </SharedSectionBand>
    </div>
</template>
