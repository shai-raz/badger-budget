<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import type { AutoSync } from "~/composables/bankSync/useAutoSync";
import { AUTO_SYNC_ERROR_MESSAGES, AutoSyncError } from "~/composables/bankSync/useAutoSync";
import { bankSyncKeys, useSyncPasskeysQuery } from "~/composables/bankSync/useBankSync";
import { useSyncUnlock } from "~/composables/bankSync/useSyncUnlock";
import { usePushDevice } from "~/composables/notifications/usePushDevice";
import {
    dateToMinute,
    expiringDaysLeft,
    lastSyncDayLabel,
    scheduleFromStatus,
    scheduleWindowLabel,
    syncDayLabel,
} from "~/utils/autoSyncForm";
import { formatAutoSyncInterval, formatMinuteOfDay } from "~/utils/autoSyncPresets";
import { STALE_PIN_MESSAGE, unlockFallbackMessage } from "~/utils/syncPasskeyWebAuthn";

/**
 * The Auto-sync band on the bank connections page. Off, on from this device, or on from another device; the
 * turn-on and change-schedule forms open in BankSyncAutoSyncDialog. The page owns the shared useAutoSync state.
 */
const props = defineProps<{
    autoSync: AutoSync;
    error?: unknown;
}>();

const toast = useToast();
const confirm = useConfirm();
const queryClient = useQueryClient();
const { isWebAuthnAvailable, unlock } = useSyncUnlock();
const { data: passkeys } = useSyncPasskeysQuery();

// On iOS, push only works from the Home Screen app, so auto-sync cannot be turned on from a browser tab.
const pushDevice = usePushDevice();
const needsHomeScreen = computed(() => pushDevice.state.value === "ios-install");
onMounted(() => void pushDevice.refresh());

const UNTIL_TOOLTIP =
    "Each unlock on this device restarts the countdown. A connection added later joins on the next unlock.";
const untilFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const status = computed(() => props.autoSync.status.value);
const holdsGrant = computed(() => props.autoSync.holdsGrant.value);
const loading = computed(() => props.autoSync.loading.value);

const schedule = computed(() => (status.value ? scheduleFromStatus(status.value) : null));
const intervalText = computed(() =>
    schedule.value ? formatAutoSyncInterval(schedule.value.intervalUnit, schedule.value.intervalCount) : "",
);
const windowText = computed(() => (schedule.value ? scheduleWindowLabel(schedule.value) : ""));
const scheduleText = computed(() => `${intervalText.value} / ${windowText.value}`);

const nextRun = computed(() => (status.value ? new Date(status.value.nextRunAt) : null));
const nextTime = computed(() => (nextRun.value ? formatMinuteOfDay(dateToMinute(nextRun.value)) : ""));
const nextSyncText = computed(() => {
    if (!nextRun.value) return "";
    const day = syncDayLabel(nextRun.value);
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${nextTime.value}`;
});
const untilText = computed(() => (status.value ? untilFormat.format(new Date(status.value.expiresAt)) : ""));

// Only the other device's card reports this: the server marks the device holding the grant as unreachable.
const unreachableSince = computed(() => {
    const current = status.value;
    if (!current?.unreachable) return null;
    return lastSyncDayLabel(new Date(current.lastRunAt ?? current.createdAt));
});
const daysLeft = computed(() => (status.value ? expiringDaysLeft(status.value.expiresAt) : null));
const daysLeftText = computed(() => {
    if (daysLeft.value === null) return "";
    return `${daysLeft.value} ${daysLeft.value === 1 ? "day" : "days"} left`;
});

const dialog = reactive<{ visible: boolean; mode: "enable" | "schedule" }>({ visible: false, mode: "enable" });

function openEnable() {
    if (needsHomeScreen.value) return;
    dialog.mode = "enable";
    dialog.visible = true;
}

function openSchedule() {
    dialog.mode = "schedule";
    dialog.visible = true;
}

function confirmMove() {
    const device = status.value ? status.value.deviceLabel : "the other device";
    confirm.require({
        header: "Auto-sync will move to this device",
        message: "Auto-sync stops on " + device + ". Unlock here to turn it on.",
        acceptLabel: "Move here",
        rejectLabel: "Cancel",
        accept: openEnable,
    });
}

async function turnOff() {
    try {
        await props.autoSync.disable();
        toast.add({ severity: "success", summary: "Success", detail: "Auto-sync is off", life: 3000 });
    } catch (err) {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: getApiErrorMessage(err, "Couldn't turn off auto-sync"),
            life: 5000,
        });
    }
}

function confirmTurnOff() {
    confirm.require({
        header: "Turn off auto-sync?",
        message: "Scheduled syncs stop on every device. You can turn them back on at any time.",
        acceptLabel: "Turn off",
        acceptClass: "p-button-danger",
        rejectLabel: "Cancel",
        accept: turnOff,
    });
}

// The switch is bound to on, so turning it off only asks; the confirm decides.
function onToggle(value: boolean) {
    if (!value) confirmTurnOff();
}

// Keep on: unlock, then renew the grant on this device. A failed passkey unlock falls back to the PIN.
const keepingOn = ref(false);
const keepPin = reactive<{ visible: boolean; pin: string; reason: string | null; error: string | null; busy: boolean }>(
    { visible: false, pin: "", reason: null, error: null, busy: false },
);

function keepOnFailed(error: unknown) {
    const detail =
        error instanceof AutoSyncError
            ? AUTO_SYNC_ERROR_MESSAGES[error.reason]
            : getApiErrorMessage(error, "Couldn't keep auto-sync on");
    toast.add({ severity: "error", summary: "Error", detail, life: 5000 });
}

function keptOn() {
    toast.add({ severity: "success", summary: "Auto-sync stays on", life: 3000 });
}

function openKeepPin(reason: string | null) {
    keepPin.pin = "";
    keepPin.reason = reason;
    keepPin.error = null;
    keepPin.visible = true;
}

async function keepOnWithPasskey() {
    let pin: string;
    try {
        pin = await unlock(passkeys.value);
    } catch (error: unknown) {
        const reason = unlockFallbackMessage(error, false);
        if (reason) openKeepPin(reason);
        else keepOnFailed(error);
        return;
    }
    try {
        await props.autoSync.renew(pin);
        keptOn();
    } catch (error: unknown) {
        const reason = unlockFallbackMessage(error, true);
        // A stale passkey wrap means the stored passkey list is out of date, so it is refetched.
        if (reason === STALE_PIN_MESSAGE) void queryClient.invalidateQueries({ queryKey: bankSyncKeys.passkeys() });
        if (reason) openKeepPin(reason);
        else keepOnFailed(error);
    }
}

async function keepOn() {
    if (keepingOn.value) return;
    keepingOn.value = true;
    try {
        if (isWebAuthnAvailable() && (passkeys.value?.length ?? 0) > 0) await keepOnWithPasskey();
        else openKeepPin(null);
    } finally {
        keepingOn.value = false;
    }
}

async function submitKeepPin() {
    if (!keepPin.pin || keepPin.busy) return;
    keepPin.busy = true;
    keepPin.error = null;
    try {
        await props.autoSync.renew(keepPin.pin);
        keepPin.visible = false;
        keepPin.pin = "";
        keptOn();
    } catch (error: unknown) {
        keepPin.error =
            error instanceof AutoSyncError
                ? AUTO_SYNC_ERROR_MESSAGES[error.reason]
                : getApiErrorMessage(error, "Couldn't keep auto-sync on");
    } finally {
        keepPin.busy = false;
    }
}
</script>

<template>
    <SharedSectionBand
        title="Auto-sync"
        :loading="loading"
        :error="error"
        :empty="false"
    >
        <template #header-extra>
            <Button
                v-if="!status && !loading && !error"
                label="Turn on auto-sync"
                severity="secondary"
                outlined
                size="small"
                :disabled="needsHomeScreen"
                @click="openEnable"
            />
        </template>

        <div
            v-if="!status"
            class="px-4 pb-4 md:px-0 md:pb-0"
        >
            <p class="text-sm text-muted-color">Sync on a schedule, even when Badger is closed.</p>
            <p
                v-if="needsHomeScreen"
                class="mt-2 text-sm"
            >
                First add Badger to your Home Screen: Share › Add to Home Screen.
            </p>
        </div>

        <div
            v-else-if="holdsGrant"
            class="flex flex-col gap-3 px-4 pb-4 md:px-0 md:pb-0"
        >
            <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 flex-col">
                    <span class="font-semibold">Sync automatically</span>
                    <span class="text-xs text-muted-color">From this device</span>
                </div>
                <ToggleSwitch
                    :model-value="true"
                    aria-label="Sync automatically"
                    class="shrink-0"
                    @update:model-value="onToggle"
                />
            </div>

            <div
                v-if="daysLeft !== null"
                class="flex flex-wrap items-center justify-between gap-3"
            >
                <div class="flex flex-wrap items-center gap-2 text-sm">
                    <span>Stops on {{ untilText }}</span>
                    <SharedStatusTag
                        :value="daysLeftText"
                        tone="warn"
                    />
                </div>
                <Button
                    label="Keep on"
                    severity="secondary"
                    outlined
                    size="small"
                    :loading="keepingOn"
                    :disabled="keepingOn"
                    @click="keepOn"
                />
            </div>

            <div class="flex items-center justify-between gap-3 md:hidden">
                <span class="min-w-0 text-sm">{{ scheduleText }} · next at {{ nextTime }}</span>
                <Button
                    label="Change"
                    severity="secondary"
                    outlined
                    size="small"
                    @click="openSchedule"
                />
            </div>
            <p
                v-if="daysLeft === null"
                class="flex items-center gap-1 text-xs text-muted-color md:hidden"
            >
                On until {{ untilText }}
                <SharedHintButton
                    icon="pi-info-circle"
                    :tooltip="UNTIL_TOOLTIP"
                    aria-label="About keeping auto-sync on"
                    class="h-11 w-11 justify-center"
                />
            </p>

            <p class="hidden text-xs text-muted-color md:block">Runs from {{ status.deviceLabel }}</p>
            <div class="hidden grid-cols-3 gap-4 md:grid">
                <div class="flex flex-col">
                    <span class="text-xs text-muted-color">How often</span>
                    <span class="font-semibold">{{ intervalText }}</span>
                    <span class="text-xs text-muted-color">{{ windowText }}</span>
                </div>
                <div class="flex flex-col">
                    <span class="text-xs text-muted-color">Next sync</span>
                    <span class="font-semibold tabular-nums">{{ nextSyncText }}</span>
                </div>
                <div class="flex flex-col">
                    <span class="text-xs text-muted-color">On until</span>
                    <span class="flex items-center gap-1 font-semibold">
                        {{ untilText }}
                        <SharedHintButton
                            icon="pi-info-circle"
                            :tooltip="UNTIL_TOOLTIP"
                            aria-label="About keeping auto-sync on"
                        />
                    </span>
                </div>
            </div>
            <div class="hidden justify-between gap-2 md:flex">
                <Button
                    label="Turn off auto-sync"
                    text
                    severity="danger"
                    size="small"
                    @click="confirmTurnOff"
                />
                <Button
                    label="Change schedule"
                    severity="secondary"
                    outlined
                    size="small"
                    @click="openSchedule"
                />
            </div>
        </div>

        <div
            v-else
            class="flex flex-col gap-3 px-4 pb-4 md:px-0 md:pb-0"
        >
            <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 flex-col">
                    <span class="font-semibold">On, from {{ status.deviceLabel }}</span>
                    <span class="text-sm text-muted-color">{{ scheduleText }}</span>
                </div>
                <Button
                    label="Move here"
                    severity="secondary"
                    outlined
                    size="small"
                    class="shrink-0"
                    :disabled="needsHomeScreen"
                    @click="confirmMove"
                />
            </div>
            <Message
                v-if="unreachableSince"
                severity="warn"
                variant="simple"
                size="small"
                >Can't reach {{ status.deviceLabel }}. No sync since {{ unreachableSince }}.</Message
            >
            <div
                v-if="daysLeft !== null"
                class="flex flex-wrap items-center gap-2 text-sm"
            >
                <span>Stops on {{ untilText }}</span>
                <SharedStatusTag
                    :value="daysLeftText"
                    tone="warn"
                />
            </div>
        </div>
    </SharedSectionBand>

    <BankSyncAutoSyncDialog
        v-model:visible="dialog.visible"
        :mode="dialog.mode"
        :auto-sync="autoSync"
    />

    <SharedFormDialog
        :visible="keepPin.visible"
        header="Keep auto-sync on"
        initial-focus="dialog"
        :busy="keepPin.busy"
        :api-error="keepPin.error"
        save-label="Keep on"
        :save-disabled="!keepPin.pin"
        width="28rem"
        @update:visible="keepPin.visible = $event"
        @save="submitKeepPin"
    >
        <Message
            v-if="keepPin.reason"
            severity="warn"
            variant="simple"
            size="small"
            >{{ keepPin.reason }}</Message
        >
        <label
            for="auto-sync-keep-pin"
            class="text-sm font-medium text-surface-700 dark:text-surface-200"
            >Sync PIN *</label
        >
        <SharedMaskedTextField
            v-model="keepPin.pin"
            placeholder="Enter your sync PIN"
            @keyup-enter="submitKeepPin"
        />
    </SharedFormDialog>
</template>
