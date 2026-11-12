import { computed, ref, type ComputedRef } from "vue";
import { AUTO_SYNC_KEY_BYTES, type AutoSyncDurationDays, type AutoSyncSchedule } from "@badger/shared-data";
import type { IAutoSyncStatus, IEnableAutoSync, IUpdateAutoSyncSchedule } from "@badger/types";
import { useApiClient } from "../useApiClient";
import { usePushDevice } from "../notifications/usePushDevice";
import { toBase64Url } from "../../utils/base64url";
import { describeDevice } from "../../utils/deviceLabel";
import { getApiErrorMessage } from "../../utils/apiError";
import { clearAutoSyncKey, loadAutoSyncKey, saveAutoSyncKey } from "../../utils/push/autoSyncKeyStore";

export type AutoSyncErrorReason = "push-denied" | "push-unavailable" | "push-failed";

/** This device could not get a push subscription, so auto-sync cannot be turned on. */
export class AutoSyncError extends Error {
    constructor(
        public readonly reason: AutoSyncErrorReason,
        message?: string,
        options?: ErrorOptions,
    ) {
        super(message ?? reason, options);
        this.name = "AutoSyncError";
    }
}

/** Copy for each reason auto-sync cannot be turned on from this device. */
export const AUTO_SYNC_ERROR_MESSAGES: Record<AutoSyncErrorReason, string> = {
    "push-denied": "Auto-sync needs notifications. Allow them for Badger, then try again.",
    "push-unavailable": "This device can't receive notifications, so auto-sync can't run here.",
    "push-failed": "Couldn't set up notifications on this device. Try again.",
};

/** Copy for an auto-sync failure: the reason's copy, else the server's message, else `fallback`. */
export function autoSyncErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof AutoSyncError) return AUTO_SYNC_ERROR_MESSAGES[error.reason];
    return getApiErrorMessage(error, fallback);
}

type ScheduleFields = Pick<
    IEnableAutoSync,
    "intervalUnit" | "intervalCount" | "windowStartMinute" | "windowEndMinute" | "runAtMinute"
>;

/** Maps the discriminated schedule to the flat DTO, sending only the fields its unit uses. */
function toScheduleFields(schedule: AutoSyncSchedule): ScheduleFields {
    if (schedule.intervalUnit === "hours") {
        return {
            intervalUnit: "hours",
            intervalCount: schedule.intervalCount,
            windowStartMinute: schedule.windowStartMinute,
            windowEndMinute: schedule.windowEndMinute,
        };
    }
    return { intervalUnit: "days", intervalCount: schedule.intervalCount, runAtMinute: schedule.runAtMinute };
}

function scheduleOf(status: IAutoSyncStatus): AutoSyncSchedule {
    if (status.intervalUnit === "hours") {
        if (status.windowStartMinute === null || status.windowEndMinute === null) {
            throw new Error("Auto-sync status has no window");
        }
        return {
            intervalUnit: "hours",
            intervalCount: status.intervalCount,
            windowStartMinute: status.windowStartMinute,
            windowEndMinute: status.windowEndMinute,
        };
    }
    if (status.runAtMinute === null) throw new Error("Auto-sync status has no run time");
    return { intervalUnit: "days", intervalCount: status.intervalCount, runAtMinute: status.runAtMinute };
}

/** Axios-style errors from the API carry a `response`; browser push failures and network errors do not. */
function isApiError(error: Error): boolean {
    return !!(error as { response?: unknown }).response;
}

function browserTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function useAutoSync() {
    const apiClient = useApiClient();
    const pushDevice = usePushDevice();

    const status = ref<IAutoSyncStatus | null>(null);
    const loading = ref(false);
    /** The grant whose key this browser holds in IndexedDB, or null. */
    const keyGrantId = ref<string | null>(null);
    const holdsGrant: ComputedRef<boolean> = computed(
        () => status.value !== null && keyGrantId.value === status.value.id,
    );

    /**
     * Must be the first await in a tap handler: push permission needs user activation. Callers that also unlock a
     * passkey take the id here first and pass it to `enable`.
     */
    async function ensurePushSubscriptionId(): Promise<string> {
        const id = await pushDevice.enable();
        if (id) return id;
        const state = pushDevice.state.value;
        if (state === "unsupported" || state === "ios-install") throw new AutoSyncError("push-unavailable");
        // A failed subscribe or register call is kept in pushDevice.error. An API error carries a message the user can
        // read, so it is rethrown. A browser failure (push service, VAPID fetch) gets its own copy, with the cause kept.
        const failure = pushDevice.error.value;
        if (failure) {
            if (isApiError(failure)) throw failure;
            throw new AutoSyncError("push-failed", failure.message, { cause: failure });
        }
        // A dismissed permission prompt leaves the state at "off", so the user is asked to allow notifications.
        if (state === "denied" || state === "off") throw new AutoSyncError("push-denied");
        throw new AutoSyncError("push-unavailable");
    }

    /** `quiet` reloads without raising `loading`, for background checks that must not flash the card. */
    async function refresh({ quiet = false }: { quiet?: boolean } = {}): Promise<void> {
        if (!quiet) loading.value = true;
        try {
            const [state, record] = await Promise.all([apiClient.getAutoSync(), loadAutoSyncKey()]);
            status.value = state.autoSync;
            keyGrantId.value = record?.grantId ?? null;
        } finally {
            if (!quiet) loading.value = false;
        }
    }

    /** The key is stored only after the API accepted the grant, so a failed request leaves nothing behind. */
    async function enable(input: {
        pin: string;
        schedule: AutoSyncSchedule;
        durationDays: AutoSyncDurationDays;
        /** From `ensurePushSubscriptionId`, taken earlier in the same tap. Omitted, it is taken here. */
        pushSubscriptionId?: string;
    }): Promise<IAutoSyncStatus> {
        const pushSubscriptionId = input.pushSubscriptionId ?? (await ensurePushSubscriptionId());
        const key = toBase64Url(crypto.getRandomValues(new Uint8Array(AUTO_SYNC_KEY_BYTES)));
        const result = await apiClient.enableAutoSync({
            ...toScheduleFields(input.schedule),
            timeZone: browserTimeZone(),
            pin: input.pin,
            key,
            deviceLabel: describeDevice(navigator.userAgent, navigator.maxTouchPoints),
            pushSubscriptionId,
            durationDays: input.durationDays,
        });
        await saveAutoSyncKey({
            grantId: result.id,
            key,
            apiBaseUrl: useRuntimeConfig().public.apiBaseUrl as string,
        });
        status.value = result;
        keyGrantId.value = result.id;
        return result;
    }

    async function updateSchedule(schedule: AutoSyncSchedule): Promise<IAutoSyncStatus> {
        const body: IUpdateAutoSyncSchedule = { ...toScheduleFields(schedule), timeZone: browserTimeZone() };
        const result = await apiClient.updateAutoSyncSchedule(body);
        status.value = result;
        return result;
    }

    async function disable(): Promise<void> {
        await apiClient.disableAutoSync();
        await clearAutoSyncKey();
        status.value = null;
        keyGrantId.value = null;
    }

    /** Silent renewal: a new grant with the current schedule and duration. Needs the PIN again. */
    async function renew(pin: string): Promise<IAutoSyncStatus> {
        const current = status.value;
        if (!current) throw new Error("Auto-sync is not on");
        return enable({ pin, schedule: scheduleOf(current), durationDays: current.durationDays });
    }

    return { status, loading, holdsGrant, ensurePushSubscriptionId, refresh, enable, updateSchedule, disable, renew };
}

/** The shape of `useAutoSync()`, passed down from the page so every auto-sync component shares one status. */
export type AutoSync = ReturnType<typeof useAutoSync>;
