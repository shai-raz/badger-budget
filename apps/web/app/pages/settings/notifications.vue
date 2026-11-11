<script setup lang="ts">
import type { IPushSubscription, INotificationPreference } from "@badger/types";
import { useToast } from "primevue/usetoast";
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
import { getApiErrorMessage } from "~/utils/apiError";
import { formatTimeAgo } from "~/utils/relativeTime";

definePageMeta({
    layout: "app",
    fullBleed: true,
});

const toast = useToast();
const authStore = useAuthStore();
const isDemo = computed(() => authStore.user?.isDemo === true);
const devtoolsEnabled = useDevtoolsFlag();

const device = usePushDevice();
const deviceState = computed(() => device.state.value);
const deviceError = computed(() => device.error.value);

const { data: subscriptions, isLoading: subscriptionsLoading, error: subscriptionsError } = usePushSubscriptionsQuery();
const { data: preferences, isLoading: preferencesLoading, error: preferencesError } = useNotificationPreferencesQuery();
const updatePreferences = useUpdateNotificationPreferencesMutation();
const removeSubscription = useDeletePushSubscriptionMutation();
const sendTest = useSendTestNotificationMutation();

const devices = computed(() => subscriptions.value ?? []);
const preferenceRows = computed(() => preferences.value ?? []);

onMounted(() => {
    void device.refresh();
});

const isThisDevice = (subscription: IPushSubscription) =>
    device.endpoint.value !== null && subscription.endpoint === device.endpoint.value;

const lastDeliveredLabel = (subscription: IPushSubscription) =>
    subscription.lastAcceptedAt ? `Last delivered ${formatTimeAgo(subscription.lastAcceptedAt)}` : "Not used yet";

// A 429 from the test endpoint is the throttle, which needs its own message.
const isTooManyRequests = (error: unknown) =>
    (error as { response?: { status?: number } } | null)?.response?.status === 429;

function setPreference(type: INotificationPreference["type"], enabled: boolean) {
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
        },
    );
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

function sendTestNotification() {
    sendTest.mutate(undefined, {
        onSuccess: ({ sent, accepted }) =>
            toast.add({
                severity: "success",
                summary: "Test notification sent",
                detail: `${accepted} of ${sent} accepted`,
                life: 4000,
            }),
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
            :loading="deviceState === 'loading'"
        >
            <div class="flex flex-col gap-3 px-4 pb-4 md:px-0 md:pb-0">
                <p
                    v-if="isDemo"
                    class="text-sm text-muted-color"
                >
                    The demo account can't turn on notifications.
                </p>

                <p
                    v-if="deviceState === 'unsupported'"
                    class="text-sm text-muted-color"
                >
                    This browser can't receive push notifications.
                </p>
                <p
                    v-else-if="deviceState === 'ios-install'"
                    class="text-sm text-muted-color"
                >
                    On iPhone and iPad, notifications need Badger on your Home Screen (iOS 16.4 or later). Tap Share,
                    then Add to Home Screen, and open Badger from there.
                </p>
                <p
                    v-else-if="deviceState === 'denied'"
                    class="text-sm text-muted-color"
                >
                    Notifications are blocked for Badger in this browser. Open this site's settings in your browser, set
                    Notifications to Allow, then reload this page.
                </p>
                <template v-else-if="deviceState === 'off'">
                    <p class="text-sm font-semibold">Notifications are off on this device.</p>
                    <div>
                        <Button
                            label="Turn on"
                            :disabled="isDemo || device.busy.value"
                            :loading="device.busy.value"
                            @click="device.enable()"
                        />
                    </div>
                </template>
                <template v-else-if="deviceState === 'on'">
                    <p class="text-sm font-semibold">Notifications are on for this device.</p>
                    <div>
                        <Button
                            label="Turn off"
                            severity="secondary"
                            outlined
                            size="small"
                            :disabled="isDemo || device.busy.value"
                            :loading="device.busy.value"
                            @click="device.disable()"
                        />
                    </div>
                </template>

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
            title="Notify me about"
            heading-id="notify-heading"
            :loading="preferencesLoading"
            :error="preferencesError"
            :empty="!preferencesLoading && !preferenceRows.length"
            empty-text="No notifications are available for your account."
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
                        :model-value="pref.mandatory || pref.enabled"
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
            :loading="subscriptionsLoading"
            :error="subscriptionsError"
            :empty="!subscriptionsLoading && !devices.length"
            empty-text="No devices yet. Turn on notifications on a device to see it here."
        >
            <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
                <div
                    v-for="subscription in devices"
                    :key="subscription.id"
                    class="flex items-center gap-3 px-4 py-3 md:px-0"
                >
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <div class="flex min-w-0 items-center gap-2">
                            <span class="truncate text-sm font-semibold">{{ subscription.deviceLabel }}</span>
                            <SharedStatusTag
                                v-if="isThisDevice(subscription)"
                                value="This device"
                            />
                        </div>
                        <span class="text-xs text-muted-color">{{ lastDeliveredLabel(subscription) }}</span>
                    </div>
                    <Button
                        icon="pi pi-trash"
                        severity="danger"
                        text
                        rounded
                        :aria-label="`Remove ${subscription.deviceLabel}`"
                        :disabled="isDemo || removeSubscription.isPending.value"
                        class="shrink-0"
                        @click="removeDevice(subscription)"
                    />
                </div>
            </div>
        </SharedSectionBand>

        <SharedSectionBand
            v-if="devtoolsEnabled"
            title="Developer options"
            heading-id="developer-heading"
        >
            <div class="flex flex-col gap-3 px-4 pb-4 md:px-0 md:pb-0">
                <p class="text-sm text-muted-color">Sends a test notification to your devices.</p>
                <div>
                    <Button
                        label="Send test notification"
                        icon="pi pi-send"
                        severity="secondary"
                        outlined
                        size="small"
                        :disabled="isDemo || sendTest.isPending.value"
                        :loading="sendTest.isPending.value"
                        @click="sendTestNotification"
                    />
                </div>
            </div>
        </SharedSectionBand>
    </div>
</template>
