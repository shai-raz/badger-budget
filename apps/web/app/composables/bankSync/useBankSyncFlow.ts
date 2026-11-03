import { inject, provide, ref, computed, watch, onMounted, onBeforeUnmount, useId, type InjectionKey } from "vue";
import { BELOW_MD } from "~/utils/breakpoints";
import { useSyncUnlock } from "./useSyncUnlock";
import {
    useTriggerSyncMutation,
    useTriggerConnectionSyncMutation,
    useActiveSyncJobQuery,
    useSyncJobQuery,
    useSyncPasskeysQuery,
} from "./useBankSync";
import { MAX_PASSKEYS } from "@badger/shared-data";
import { useToast } from "primevue/usetoast";
import type { ToastMessageOptions } from "primevue/toast";
import { useQueryClient } from "@tanstack/vue-query";
import type { ISyncJob, ISyncPasskey } from "@badger/types";
import { accountKeys } from "~/composables/accounts/useAccounts";
import { budgetKeys } from "~/composables/useBudgets";
import { reportKeys } from "~/composables/reports/useSpendingReport";
import { bankSyncKeys } from "~/composables/bankSync/useBankSync";
import { useAuthStore } from "~/stores/auth";
import {
    SyncUnlockError,
    STALE_PIN_MESSAGE,
    UNSUPPORTED_MESSAGE,
    unlockFallbackMessage,
} from "~/utils/syncPasskeyWebAuthn";
import { hasRegisteredOnDevice, isOfferDismissed, markOfferDismissed } from "~/utils/syncPasskeyDeviceFlags";
import {
    runProblemSummary,
    connectionSyncStates,
    finishedConnectionIds,
    type ConnectionSyncState,
} from "~/utils/syncRuns";
import { syncErrorCopy } from "~/utils/syncErrors";

export const SYNC_RESULT_TOAST_GROUP = "sync-result";

/** What a sync-result toast carries: the run it describes, and whether it links to that run's failure details. */
export interface SyncResultToastData {
    jobId: string;
    /** False for interrupted runs, which have no failure to explain. */
    seeWhy: boolean;
}

export function isSyncResultToastData(data: unknown): data is SyncResultToastData {
    return (
        typeof data === "object" &&
        data !== null &&
        "jobId" in data &&
        typeof data.jobId === "string" &&
        "seeWhy" in data &&
        typeof data.seeWhy === "boolean"
    );
}

/** A result line from the run's problem summary, ended with a full stop. Never raw bank error text. */
const problemSentence = (job: ISyncJob) => `${runProblemSummary(job) ?? syncErrorCopy("UNKNOWN").short}.`;

const bankSyncFlowKey: InjectionKey<ReturnType<typeof createBankSyncFlow>> = Symbol("bank-sync-flow");

export function provideBankSyncFlow() {
    const flow = createBankSyncFlow();
    provide(bankSyncFlowKey, flow);
    return flow;
}

export function useBankSyncFlow() {
    const flow = inject(bankSyncFlowKey);
    if (!flow) throw new Error("Bank sync flow requires the app layout");
    return flow;
}

function createBankSyncFlow() {
    const toast = useToast();
    const queryClient = useQueryClient();
    const authStore = useAuthStore();

    // Typed PIN kept in memory only, so a successful sync can offer to wrap it in a passkey. Never a ref, storage or log.
    let offerPin: string | null = null;
    // Passkeys loaded when the offer was shown, so credentials.create is the first await after Enable (Safari activation).
    let offerKnownPasskeys: ISyncPasskey[] | undefined;
    const OFFER_LIFE_MS = 60_000;
    const toastBreakpoints = {
        [BELOW_MD]: { width: "calc(100vw - 2rem)", left: "1rem", right: "1rem" },
    };
    const offerGroup = `sync-passkey-offer-${useId()}`;

    const triggerSyncMutation = useTriggerSyncMutation();
    const triggerConnectionSyncMutation = useTriggerConnectionSyncMutation();
    const triggerPending = computed(
        () => triggerSyncMutation.isPending.value || triggerConnectionSyncMutation.isPending.value,
    );
    let target: { connectionId?: string; defaultCurrencyCode?: string } = {};

    // Track the active job ID for polling
    const activeJobId = ref<string | null>(null);
    const syncedCount = ref<number | null>(null);

    // Poll active job on mount to resume any in-progress sync
    const { data: activeJobData, refetch: refetchActiveJob } = useActiveSyncJobQuery();

    onMounted(async () => {
        await refetchActiveJob();
        if (activeJobId.value) return;
        const job = activeJobData.value;
        if (job && (job.status === "pending" || job.status === "running")) {
            activeJobId.value = job.id;
            syncedCount.value = job.transactionsSynced ?? null;
        }
    });

    // Poll the specific job when we have an ID
    const jobId = computed(() => activeJobId.value);
    const { data: jobData } = useSyncJobQuery(jobId);

    // Live state of each connection in the active run, for the connection rows.
    const syncingConnections = computed(() => {
        const job = jobData.value;
        return connectionSyncStates(job && job.id === activeJobId.value ? job : null);
    });
    const connectionSyncState = (connectionId: string): ConnectionSyncState | null =>
        syncingConnections.value.get(connectionId) ?? null;

    // One group for every sync result, so the "See why" link can close the toast and open that run's dialog.
    const addSyncResultToast = (job: ISyncJob, message: ToastMessageOptions, seeWhy: boolean) => {
        const syncResult: ToastMessageOptions & { data: SyncResultToastData } = {
            ...message,
            group: SYNC_RESULT_TOAST_GROUP,
            data: { jobId: job.id, seeWhy },
        };
        toast.add(syncResult);
    };

    // Connections whose scraper job had finished at the last poll, per run.
    let finishedSeen: { jobId: string; ids: Set<string> } | null = null;

    // Watch job data for updates
    watch(jobData, (job) => {
        if (!job || job.id !== activeJobId.value) return;

        if (job.status === "pending" || job.status === "running") {
            const finished = finishedConnectionIds(job);
            const seen = finishedSeen?.jobId === job.id ? finishedSeen.ids : new Set<string>();
            // A finished bank's row must show its new last-sync time or failure within one poll, not only at the end of the run.
            if ([...finished].some((id) => !seen.has(id))) {
                queryClient.invalidateQueries({ queryKey: bankSyncKeys.connections() });
            }
            finishedSeen = { jobId: job.id, ids: finished };
        }

        syncedCount.value = job.transactionsSynced ?? null;
        // Any terminal status moves the run from Syncing to its result in the history list.
        if (job.status !== "pending" && job.status !== "running") {
            queryClient.invalidateQueries({ queryKey: bankSyncKeys.history() });
        }

        if (job.status === "success") {
            toast.add({
                severity: "success",
                summary: "Sync complete",
                detail: `Successfully synced ${job.transactionsSynced ?? 0} transaction${job.transactionsSynced !== 1 ? "s" : ""}`,
                life: 5000,
            });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["bank-sync", "connections"] });
            queryClient.invalidateQueries({ queryKey: accountKeys.all });
            queryClient.invalidateQueries({ queryKey: budgetKeys.all });
            queryClient.invalidateQueries({ queryKey: reportKeys.all });
            activeJobId.value = null;
            syncedCount.value = null;
            void maybeOfferPasskey();
        } else if (job.status === "partial") {
            offerPin = null;
            const synced = job.transactionsSynced ?? 0;
            addSyncResultToast(
                job,
                {
                    severity: "warn",
                    summary: "Sync partly complete",
                    detail: `Synced ${synced} transaction${synced !== 1 ? "s" : ""}. ${problemSentence(job)}`,
                    life: 8000,
                },
                true,
            );
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["bank-sync", "connections"] });
            queryClient.invalidateQueries({ queryKey: accountKeys.all });
            queryClient.invalidateQueries({ queryKey: budgetKeys.all });
            queryClient.invalidateQueries({ queryKey: reportKeys.all });
            activeJobId.value = null;
            syncedCount.value = null;
        } else if (job.status === "failed") {
            offerPin = null;
            addSyncResultToast(
                job,
                { severity: "error", summary: "Sync failed", detail: problemSentence(job), life: 7000 },
                true,
            );
            queryClient.invalidateQueries({ queryKey: ["bank-sync", "connections"] });
            activeJobId.value = null;
            syncedCount.value = null;
        } else if (job.status === "interrupted") {
            // Terminal: clear the job so the spinner can't stick on a run the server will never finish.
            offerPin = null;
            addSyncResultToast(
                job,
                { severity: "warn", summary: "Sync interrupted", detail: problemSentence(job), life: 8000 },
                false,
            );
            queryClient.invalidateQueries({ queryKey: ["bank-sync", "connections"] });
            activeJobId.value = null;
            syncedCount.value = null;
        }
    });

    // Decide from the warmed cache so credentials.get is the first await after the click (Safari needs the gesture).
    const { data: passkeys } = useSyncPasskeysQuery();
    const { isWebAuthnAvailable, isPlatformAuthenticatorAvailable, fetchPasskeys, register, unlock } = useSyncUnlock();

    const maybeOfferPasskey = async () => {
        if (!offerPin) return;
        const userId = authStore.user?.id;
        try {
            let existing: ISyncPasskey[] = [];
            if (
                userId &&
                isWebAuthnAvailable() &&
                (await isPlatformAuthenticatorAvailable()) &&
                !hasRegisteredOnDevice(userId) &&
                !isOfferDismissed(userId) &&
                (existing = await fetchPasskeys()).length < MAX_PASSKEYS &&
                offerPin
            ) {
                offerKnownPasskeys = existing;
                toast.add({ group: offerGroup, severity: "info", life: OFFER_LIFE_MS });
                return;
            }
        } catch {
            // Offer is best-effort; fall through and drop the PIN.
        }
        offerPin = null;
        offerKnownPasskeys = undefined;
    };

    const dismissOffer = () => {
        const userId = authStore.user?.id;
        if (userId) markOfferDismissed(userId);
        toast.removeGroup(offerGroup);
        offerPin = null;
        offerKnownPasskeys = undefined;
    };

    // Timed out unanswered: drop the PIN but don't count it as a dismissal, so the offer can return on a later sync.
    const onOfferExpired = () => {
        offerPin = null;
        offerKnownPasskeys = undefined;
    };

    // Idempotent: Not now and the close (X) both land here.
    const onOfferClosed = () => {
        if (offerPin === null) return;
        dismissOffer();
    };

    const enablePasskey = async () => {
        toast.removeGroup(offerGroup);
        const p = offerPin;
        offerPin = null;
        const known = offerKnownPasskeys;
        offerKnownPasskeys = undefined;
        if (!p) return;
        const userId = authStore.user?.id;
        try {
            await register(p, known);
            toast.add({
                severity: "success",
                summary: "Passkey added. Next time, Sync will use it.",
                life: 5000,
            });
        } catch (error: unknown) {
            if (userId) markOfferDismissed(userId);
            if (error instanceof SyncUnlockError && error.reason === "unsupported") {
                toast.add({ severity: "error", summary: "Error", detail: UNSUPPORTED_MESSAGE, life: 5000 });
            } else if (error instanceof SyncUnlockError && error.reason === "cancelled") {
                toast.add({
                    severity: "info",
                    summary: "You can add a passkey later in Settings.",
                    life: 5000,
                });
            } else {
                toast.add({
                    severity: "error",
                    summary: "Error",
                    detail: "Could not add a passkey. You can try again in Settings.",
                    life: 5000,
                });
            }
        }
    };

    onBeforeUnmount(() => {
        offerPin = null;
        pin.value = "";
        target = {};
    });

    // PIN dialog state
    const pinDialogVisible = ref(false);
    const pin = ref("");
    const unlocking = ref(false);
    const fallbackReason = ref<string | null>(null);
    const canRetryPasskey = ref(false);

    const buttonLoading = computed(() => triggerPending.value || unlocking.value);

    const openPinDialog = () => {
        pin.value = "";
        fallbackReason.value = null;
        canRetryPasskey.value = false;
        pinDialogVisible.value = true;
    };

    type ApiError = { response?: { status?: number; data?: { message?: string } } };

    const showStartError = (error: unknown) => {
        toast.add({
            severity: "error",
            summary: "Failed to Start Sync",
            detail: (error as ApiError)?.response?.data?.message || "Could not start sync",
            life: 5000,
        });
    };

    const startSync = async (syncPin: string, { typed }: { typed: boolean }) => {
        const data = { pin: syncPin, defaultCurrencyCode: target.defaultCurrencyCode };
        const result = target.connectionId
            ? await triggerConnectionSyncMutation.mutateAsync({ ...data, connectionId: target.connectionId })
            : await triggerSyncMutation.mutateAsync(data);
        target = {};
        // A toast from an earlier sync must not outlive its PIN (removeGroup emits neither close nor life-end).
        toast.removeGroup(offerGroup);
        offerKnownPasskeys = undefined;
        offerPin = typed ? syncPin : null;
        activeJobId.value = result.jobId;
        syncedCount.value = null;
        // The new run appears in the history list as Syncing.
        queryClient.invalidateQueries({ queryKey: bankSyncKeys.history() });
    };

    const openPinFallback = (reason: string) => {
        pin.value = "";
        fallbackReason.value = reason;
        // A stale PIN means the server already deleted the passkey rows, so a retry could never work.
        canRetryPasskey.value = reason !== STALE_PIN_MESSAGE;
        pinDialogVisible.value = true;
    };

    const tryPasskeySync = async () => {
        if (unlocking.value) return;
        unlocking.value = true;
        pinDialogVisible.value = false;
        let pinFromPasskey = false;
        try {
            const unlockedPin = await unlock(passkeys.value);
            pinFromPasskey = true;
            await startSync(unlockedPin, { typed: false });
        } catch (error: unknown) {
            const reason = unlockFallbackMessage(error, pinFromPasskey);
            if (reason === STALE_PIN_MESSAGE) {
                void queryClient.invalidateQueries({ queryKey: bankSyncKeys.passkeys() });
            }
            if (reason) openPinFallback(reason);
            else showStartError(error);
        } finally {
            unlocking.value = false;
        }
    };

    const busy = computed(() => buttonLoading.value || !!activeJobId.value);
    const requestSync = (selection: { connectionId?: string; defaultCurrencyCode?: string } = {}) => {
        if (busy.value || pinDialogVisible.value) return;
        target = { ...selection };
        if (isWebAuthnAvailable() && (passkeys.value?.length ?? 0) > 0) {
            void tryPasskeySync();
            return;
        }
        openPinDialog();
    };

    const submitSync = async () => {
        if (!pin.value || triggerPending.value || unlocking.value || activeJobId.value) return;

        try {
            await startSync(pin.value, { typed: true });
            pin.value = "";
            pinDialogVisible.value = false;
        } catch (error: unknown) {
            showStartError(error);
        }
    };

    /** Syncs one connection with a PIN the caller already unlocked (e.g. the edit modal), so the user isn't asked twice. Returns whether a sync started. */
    const syncConnectionWithPin = async (
        connectionId: string,
        syncPin: string,
        { typed }: { typed: boolean },
    ): Promise<boolean> => {
        if (busy.value || pinDialogVisible.value) {
            toast.add({
                severity: "info",
                summary: "A sync is already running",
                detail: "Sync this connection again when it finishes.",
                life: 5000,
            });
            return false;
        }
        target = { connectionId };
        try {
            await startSync(syncPin, { typed });
            return true;
        } catch (error: unknown) {
            target = {};
            showStartError(error);
            return false;
        }
    };

    const cancelSync = () => {
        if (triggerPending.value) return;
        pinDialogVisible.value = false;
        pin.value = "";
        target = {};
    };
    watch(pinDialogVisible, (visible) => {
        // Passkey fallback hides the dialog while retaining its selected connection.
        if (!visible && !unlocking.value && !triggerPending.value) {
            pin.value = "";
            target = {};
        }
    });
    return {
        activeJobId,
        syncedCount,
        busy,
        buttonLoading,
        requestSync,
        offerGroup,
        toastBreakpoints,
        onOfferClosed,
        onOfferExpired,
        dismissOffer,
        enablePasskey,
        pinDialogVisible,
        pin,
        fallbackReason,
        canRetryPasskey,
        tryPasskeySync,
        submitSync,
        triggerPending,
        cancelSync,
        syncConnectionWithPin,
        connectionSyncState,
    };
}
