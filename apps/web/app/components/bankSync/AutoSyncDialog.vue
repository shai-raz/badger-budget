<script setup lang="ts">
import {
    AUTO_SYNC_DURATIONS,
    DEFAULT_AUTO_SYNC_DURATION_DAYS,
    DEFAULT_AUTO_SYNC_SCHEDULE,
    autoSyncRunsPerDay,
    isAutoSyncDurationAllowed,
    type AutoSyncDurationDays,
    type AutoSyncIntervalUnit,
    type AutoSyncSchedule,
} from "@badger/shared-data";
import { useQueryClient } from "@tanstack/vue-query";
import type { AutoSync } from "~/composables/bankSync/useAutoSync";
import { autoSyncErrorMessage } from "~/composables/bankSync/useAutoSync";
import { bankSyncKeys, useSyncPasskeysQuery } from "~/composables/bankSync/useBankSync";
import { useSyncUnlock } from "~/composables/bankSync/useSyncUnlock";
import {
    dateToMinute,
    firstAllowedDuration,
    firstSyncLabel,
    intervalCountError,
    minuteToDate,
    scheduleFromStatus,
} from "~/utils/autoSyncForm";
import { AUTO_SYNC_PRESETS, matchAutoSyncPreset, type AutoSyncPresetId } from "~/utils/autoSyncPresets";
import { STALE_PIN_MESSAGE, unlockFallbackMessage } from "~/utils/syncPasskeyWebAuthn";

/**
 * Turns auto-sync on ("enable": PIN from a passkey or typed, then the grant) or changes its schedule ("schedule": no
 * unlock). Opened over a card; the form starts from the stored status when there is one, else the defaults.
 */
const props = defineProps<{
    visible: boolean;
    mode: "enable" | "schedule";
    autoSync: AutoSync;
}>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
}>();

const status = computed(() => props.autoSync.status.value);
const isEnable = computed(() => props.mode === "enable");

const labelClass = "text-sm font-medium text-surface-700 dark:text-surface-200";
const errorClass = "text-sm text-red-500";

// Form state. Hours use the window, days use the run time; the other pair keeps its default.
const presetChoice = ref<AutoSyncPresetId | "custom">("4h");
const customUnit = ref<AutoSyncIntervalUnit>("hours");
const customCount = ref<number | null>(4);
const startMinute = ref(420);
const endMinute = ref(1320);
const runAtMinute = ref(420);
const durationDays = ref<AutoSyncDurationDays>(DEFAULT_AUTO_SYNC_DURATION_DAYS);

const busy = ref(false);
const apiError = ref<string | null>(null);
const typedPin = ref("");
const usePinInstead = ref(false);
const pinFallbackReason = ref<string | null>(null);

const { isWebAuthnAvailable, unlock } = useSyncUnlock();
const queryClient = useQueryClient();
const { data: passkeys } = useSyncPasskeysQuery();
const hasPasskeys = computed(() => (passkeys.value?.length ?? 0) > 0);
const passkeyMode = computed(
    () => isEnable.value && isWebAuthnAvailable() && hasPasskeys.value && !usePinInstead.value,
);

const isCustom = computed(() => presetChoice.value === "custom");
const preset = computed(() => AUTO_SYNC_PRESETS.find((p) => p.id === presetChoice.value));
const unit = computed<AutoSyncIntervalUnit>(() =>
    isCustom.value ? customUnit.value : (preset.value?.intervalUnit ?? "hours"),
);
const count = computed<number | null>(() =>
    isCustom.value ? customCount.value : (preset.value?.intervalCount ?? null),
);
const countError = computed(() => (isCustom.value ? intervalCountError(unit.value, customCount.value) : null));
const validCount = computed<number | null>(() => {
    if (count.value === null || intervalCountError(unit.value, count.value) !== null) return null;
    return count.value;
});
const windowError = computed(() => unit.value === "hours" && startMinute.value === endMinute.value);

// Null while the form is invalid, which also disables submit.
const schedule = computed<AutoSyncSchedule | null>(() => {
    if (validCount.value === null) return null;
    if (unit.value === "hours") {
        if (windowError.value) return null;
        return {
            intervalUnit: "hours",
            intervalCount: validCount.value,
            windowStartMinute: startMinute.value,
            windowEndMinute: endMinute.value,
        };
    }
    return { intervalUnit: "days", intervalCount: validCount.value, runAtMinute: runAtMinute.value };
});

const runsPerDay = computed(() =>
    unit.value === "hours" && validCount.value !== null && !windowError.value
        ? autoSyncRunsPerDay(startMinute.value, endMinute.value, validCount.value)
        : null,
);

const frequencyOptions = [
    ...AUTO_SYNC_PRESETS.map((p) => ({ label: p.label, value: p.id, disabled: false, divider: false })),
    { label: "", value: "divider", disabled: true, divider: true },
    { label: "Custom…", value: "custom", disabled: false, divider: false },
];
const unitOptions = [
    { label: "hours", value: "hours" },
    { label: "days", value: "days" },
];

const durationOptions = computed(() =>
    AUTO_SYNC_DURATIONS.map((days) => ({
        label: `${days} days`,
        value: days,
        disabled: validCount.value !== null && !isAutoSyncDurationAllowed(days, unit.value, validCount.value),
    })),
);

// A duration that no longer covers two intervals moves to the shortest one that does.
watch([unit, validCount], ([nextUnit, nextCount]) => {
    if (nextCount === null) return;
    durationDays.value = firstAllowedDuration(durationDays.value, nextUnit, nextCount);
});

// Time pickers bind to Dates; the form keeps minutes of the day.
function timeModel(minute: Ref<number>) {
    return computed<Date>({
        get: () => minuteToDate(minute.value),
        set: (value: unknown) => {
            if (value instanceof Date) minute.value = dateToMinute(value);
        },
    });
}
const startDate = timeModel(startMinute);
const endDate = timeModel(endMinute);
const runAtDate = timeModel(runAtMinute);

// Schedule mode cannot change the grant's duration, so the interval must fit inside the one it already has.
const durationConflict = computed(
    () =>
        !isEnable.value &&
        status.value !== null &&
        validCount.value !== null &&
        !isAutoSyncDurationAllowed(status.value.durationDays, unit.value, validCount.value),
);

const canSubmit = computed(
    () =>
        schedule.value !== null &&
        !durationConflict.value &&
        (!isEnable.value || passkeyMode.value || typedPin.value.length > 0),
);

function reset() {
    const current = status.value;
    const stored = current ? scheduleFromStatus(current) : DEFAULT_AUTO_SYNC_SCHEDULE;
    presetChoice.value = matchAutoSyncPreset(stored.intervalUnit, stored.intervalCount);
    customUnit.value = stored.intervalUnit;
    customCount.value = stored.intervalCount;
    if (stored.intervalUnit === "hours") {
        startMinute.value = stored.windowStartMinute;
        endMinute.value = stored.windowEndMinute;
    } else {
        runAtMinute.value = stored.runAtMinute;
    }
    durationDays.value = isEnable.value && current ? current.durationDays : DEFAULT_AUTO_SYNC_DURATION_DAYS;
    if (validCount.value !== null) {
        durationDays.value = firstAllowedDuration(durationDays.value, unit.value, validCount.value);
    }
    typedPin.value = "";
    usePinInstead.value = false;
    pinFallbackReason.value = null;
    apiError.value = null;
}

// Each open starts from the stored schedule (or the defaults), as if the form were new.
watch(
    () => props.visible,
    (visible) => {
        if (visible) reset();
    },
    { immediate: true },
);

function usePin(reason: string | null = null) {
    usePinInstead.value = true;
    pinFallbackReason.value = reason;
}

function tryPasskeyAgain() {
    usePinInstead.value = false;
    pinFallbackReason.value = null;
    typedPin.value = "";
}

function errorMessage(error: unknown): string {
    return autoSyncErrorMessage(error, isEnable.value ? "Couldn't turn on auto-sync" : "Couldn't save the schedule");
}

// Push permission still at "default" needs this tap's user activation, so it is only read here, before any await.
// A granted permission resolves without a prompt.
function pushPermissionGranted(): boolean {
    return typeof Notification !== "undefined" && Notification.permission === "granted";
}

const PUSH_FIRST_PASSKEY_REASON = "Notifications are on. Enter your PIN, or try your passkey again.";

// Unlocks with the passkey (or the typed PIN), then turns auto-sync on. False when the PIN fallback opened instead.
async function submitEnable(next: AutoSyncSchedule): Promise<boolean> {
    // The passkey ceremony and a permission prompt both need this tap's user activation, and Safari drops it at the
    // first await. So with permission still "default", push goes first and the passkey waits for the next tap.
    if (passkeyMode.value && !pushPermissionGranted()) {
        await props.autoSync.ensurePushSubscriptionId();
        usePin(PUSH_FIRST_PASSKEY_REASON);
        return false;
    }
    let pin = typedPin.value;
    let fromPasskey = false;
    if (passkeyMode.value) {
        try {
            pin = await unlock(passkeys.value);
            fromPasskey = true;
        } catch (error: unknown) {
            const reason = unlockFallbackMessage(error, false);
            if (reason) {
                usePin(reason);
                return false;
            }
            throw error;
        }
    }
    const pushSubscriptionId = await props.autoSync.ensurePushSubscriptionId();
    try {
        await props.autoSync.enable({ pin, schedule: next, durationDays: durationDays.value, pushSubscriptionId });
        return true;
    } catch (error: unknown) {
        const reason = unlockFallbackMessage(error, fromPasskey);
        if (reason) {
            // A stale PIN means the stored passkey no longer unlocks, so the list is refetched.
            if (reason === STALE_PIN_MESSAGE) void queryClient.invalidateQueries({ queryKey: bankSyncKeys.passkeys() });
            usePin(reason);
            return false;
        }
        throw error;
    }
}

async function submit() {
    const next = schedule.value;
    if (!next || !canSubmit.value || busy.value) return;
    busy.value = true;
    apiError.value = null;
    try {
        if (isEnable.value) {
            if (!(await submitEnable(next))) return;
        } else {
            await props.autoSync.updateSchedule(next);
        }
        emit("update:visible", false);
    } catch (error: unknown) {
        apiError.value = errorMessage(error);
    } finally {
        busy.value = false;
    }
}

const dialogHeader = computed(() => (isEnable.value ? "Turn on auto-sync" : "Change schedule"));
const saveLabel = computed(() => (isEnable.value ? "Unlock and turn on" : "Save"));
</script>

<template>
    <SharedFormDialog
        :visible="visible"
        :header="dialogHeader"
        initial-focus="dialog"
        :busy="busy"
        :api-error="apiError"
        :save-label="saveLabel"
        :save-disabled="!canSubmit"
        width="36rem"
        @update:visible="emit('update:visible', $event)"
        @save="submit"
    >
        <template #headerHint>
            <SharedHintButton
                icon="pi-info-circle"
                tooltip="Syncs on a schedule, even when Badger is closed. Your bank logins are locked with a key kept on this device."
                aria-label="About auto-sync"
                class="h-11 w-11 justify-center md:h-auto md:w-auto"
            />
        </template>

        <div class="flex flex-col gap-1">
            <label
                for="auto-sync-how-often"
                :class="labelClass"
                >How often</label
            >
            <div class="flex flex-col gap-3 md:flex-row md:items-start">
                <Select
                    v-model="presetChoice"
                    input-id="auto-sync-how-often"
                    :options="frequencyOptions"
                    option-label="label"
                    option-value="value"
                    option-disabled="disabled"
                    class="w-full md:w-56"
                >
                    <template #option="{ option }">
                        <hr
                            v-if="option.divider"
                            class="my-1 border-surface-200 dark:border-surface-700"
                        />
                        <span v-else>{{ option.label }}</span>
                    </template>
                </Select>

                <div
                    v-if="isCustom"
                    class="flex flex-col gap-1"
                >
                    <div class="flex items-center gap-2">
                        <span class="text-sm text-muted-color">Every</span>
                        <InputNumber
                            v-model="customCount"
                            :min="1"
                            :use-grouping="false"
                            aria-label="Every how many"
                            class="w-24"
                            input-class="w-full"
                            :invalid="!!countError"
                        />
                        <Select
                            v-model="customUnit"
                            :options="unitOptions"
                            option-label="label"
                            option-value="value"
                            aria-label="Interval unit"
                            class="w-28"
                        />
                    </div>
                    <small
                        v-if="countError"
                        :class="errorClass"
                        role="alert"
                        >{{ countError }}</small
                    >
                </div>
            </div>
        </div>

        <div
            v-if="unit === 'hours'"
            class="flex flex-col gap-1"
        >
            <span :class="labelClass">Only between</span>
            <div class="flex items-center gap-2">
                <DatePicker
                    v-model="startDate"
                    time-only
                    hour-format="24"
                    :manual-input="false"
                    input-id="auto-sync-window-start"
                    aria-label="Window start"
                    class="min-w-0 flex-1"
                    input-class="w-full"
                    :invalid="windowError"
                />
                <span class="text-sm text-muted-color">and</span>
                <DatePicker
                    v-model="endDate"
                    time-only
                    hour-format="24"
                    :manual-input="false"
                    input-id="auto-sync-window-end"
                    aria-label="Window end"
                    class="min-w-0 flex-1"
                    input-class="w-full"
                    :invalid="windowError"
                />
            </div>
            <small
                v-if="windowError"
                :class="errorClass"
                role="alert"
                >Start and end can't be the same time.</small
            >
            <p
                v-else-if="runsPerDay !== null"
                class="text-xs text-muted-color"
            >
                About {{ runsPerDay }} {{ runsPerDay === 1 ? "sync" : "syncs" }} a day.
            </p>
        </div>

        <div
            v-else
            class="flex flex-col gap-1"
        >
            <label
                for="auto-sync-run-at"
                :class="labelClass"
                >At</label
            >
            <DatePicker
                v-model="runAtDate"
                time-only
                hour-format="24"
                :manual-input="false"
                input-id="auto-sync-run-at"
                class="w-full md:w-48"
            />
            <p class="text-xs text-muted-color">First sync {{ firstSyncLabel(runAtMinute) }}.</p>
        </div>

        <small
            v-if="durationConflict"
            :class="errorClass"
            role="alert"
            >Auto-sync is kept on for {{ status?.durationDays }} days, too short for this schedule. Turn it off and on
            again to choose a longer "Keep on for".</small
        >

        <template v-if="isEnable">
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-1">
                    <span :class="labelClass">Keep on for</span>
                    <SharedHintButton
                        icon="pi-info-circle"
                        tooltip="Each unlock on this device restarts the countdown. A connection added later joins on the next unlock."
                        aria-label="About keeping auto-sync on"
                        class="h-11 w-11 justify-center md:h-auto md:w-auto"
                    />
                </div>
                <SelectButton
                    v-model="durationDays"
                    :options="durationOptions"
                    option-label="label"
                    option-value="value"
                    option-disabled="disabled"
                    :allow-empty="false"
                    aria-label="Keep on for"
                    class="flex w-full"
                    :pt="{ pcToggleButton: { root: { class: 'flex-1' } } }"
                />
            </div>

            <p class="flex items-center gap-2 text-sm text-muted-color">
                <i
                    class="pi pi-bell shrink-0"
                    aria-hidden="true"
                ></i>
                Next, allow notifications when asked.
            </p>

            <div
                v-if="!passkeyMode"
                class="flex flex-col gap-2"
            >
                <Message
                    v-if="pinFallbackReason"
                    severity="warn"
                    variant="simple"
                    size="small"
                    >{{ pinFallbackReason }}</Message
                >
                <label
                    for="auto-sync-pin"
                    :class="labelClass"
                    >Sync PIN *</label
                >
                <SharedMaskedTextField
                    v-model="typedPin"
                    input-id="auto-sync-pin"
                    placeholder="Enter your sync PIN"
                    @keyup-enter="submit"
                />
                <Button
                    v-if="hasPasskeys && usePinInstead"
                    label="Try passkey again"
                    link
                    size="small"
                    class="self-start p-0"
                    @click="tryPasskeyAgain"
                />
            </div>
            <Button
                v-else
                label="Use PIN instead"
                link
                size="small"
                class="self-start p-0"
                @click="usePin()"
            />
        </template>
    </SharedFormDialog>
</template>
