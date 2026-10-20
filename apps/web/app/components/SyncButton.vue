<script setup lang="ts">
import { MAX_PASSKEYS } from "@badger/shared-data";
import { useToast } from "primevue/usetoast";
import { useQueryClient } from "@tanstack/vue-query";
import type { ButtonProps } from "primevue/button";
import type { ISyncPasskey } from "@badger/types";
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

const props = defineProps<{
    defaultCurrencyCode?: string;
    size?: ButtonProps["size"];
    /** Render as an icon-only button (mobile compact header). */
    iconOnly?: boolean;
}>();

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
const triggerPending = computed(() => triggerSyncMutation.isPending.value);

// Track the active job ID for polling
const activeJobId = ref<string | null>(null);
const syncedCount = ref<number | null>(null);

// Poll active job on mount to resume any in-progress sync
const { data: activeJobData, refetch: refetchActiveJob } = useActiveSyncJobQuery();

onMounted(async () => {
    await refetchActiveJob();
    const job = activeJobData.value;
    if (job && (job.status === "pending" || job.status === "running")) {
        activeJobId.value = job.id;
        syncedCount.value = job.transactionsSynced ?? null;
    }
});

// Poll the specific job when we have an ID
const jobId = computed(() => activeJobId.value);
const { data: jobData } = useSyncJobQuery(jobId);

// Watch job data for updates
watch(jobData, (job) => {
    if (!job) return;

    syncedCount.value = job.transactionsSynced ?? null;

    if (job.status === "success") {
        toast.add({
            severity: "success",
            summary: "Sync Complete",
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
        const failed = job.scraperJobs?.filter((s) => s.status === "failed") ?? [];
        const failedNames = failed.map((s) => s.displayName).join(", ");
        toast.add({
            severity: "warn",
            summary: "Sync Partially Complete",
            detail: `Synced ${job.transactionsSynced ?? 0} transaction${job.transactionsSynced !== 1 ? "s" : ""}. Failed: ${failedNames}`,
            life: 8000,
        });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["bank-sync", "connections"] });
        queryClient.invalidateQueries({ queryKey: accountKeys.all });
        queryClient.invalidateQueries({ queryKey: budgetKeys.all });
        queryClient.invalidateQueries({ queryKey: reportKeys.all });
        activeJobId.value = null;
        syncedCount.value = null;
    } else if (job.status === "failed") {
        offerPin = null;
        const failed = job.scraperJobs?.filter((s) => s.status === "failed") ?? [];
        const detail =
            failed.length > 0
                ? failed.map((s) => `${s.displayName}: ${s.error ?? "unknown error"}`).join("\n")
                : job.error || "An error occurred during sync";
        toast.add({
            severity: "error",
            summary: "Sync Failed",
            detail,
            life: 7000,
        });
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
    const result = await triggerSyncMutation.mutateAsync({
        pin: syncPin,
        defaultCurrencyCode: props.defaultCurrencyCode,
    });
    // A toast from an earlier sync must not outlive its PIN (removeGroup emits neither close nor life-end).
    toast.removeGroup(offerGroup);
    offerKnownPasskeys = undefined;
    offerPin = typed ? syncPin : null;
    activeJobId.value = result.jobId;
    syncedCount.value = null;
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

const onSyncClick = () => {
    if (unlocking.value) return;
    if (isWebAuthnAvailable() && (passkeys.value?.length ?? 0) > 0) {
        void tryPasskeySync();
        return;
    }
    openPinDialog();
};

const submitSync = async () => {
    if (!pin.value) return;

    try {
        await startSync(pin.value, { typed: true });
        pin.value = "";
        pinDialogVisible.value = false;
    } catch (error: unknown) {
        showStartError(error);
    }
};
</script>

<template>
    <Toast
        :group="offerGroup"
        :breakpoints="toastBreakpoints"
        @close="onOfferClosed"
        @life-end="onOfferExpired"
    >
        <template #message>
            <div class="flex flex-col gap-2">
                <span class="font-semibold">Use Face ID / fingerprint next time?</span>
                <span class="text-sm">Unlock bank sync with a passkey instead of typing your PIN.</span>
                <div class="flex gap-2 justify-end">
                    <Button
                        label="Not now"
                        size="small"
                        severity="secondary"
                        text
                        @click="dismissOffer"
                    />
                    <Button
                        label="Enable"
                        size="small"
                        @click="enablePasskey"
                    />
                </div>
            </div>
        </template>
    </Toast>

    <!-- Idle state -->
    <div v-if="!activeJobId">
        <Button
            icon="pi pi-sync"
            :size="size"
            :label="iconOnly ? undefined : 'Sync'"
            :aria-label="iconOnly ? 'Sync' : undefined"
            :text="iconOnly"
            :rounded="iconOnly"
            :loading="buttonLoading"
            @click="onSyncClick"
        />
        <Dialog
            v-model:visible="pinDialogVisible"
            header="Enter sync PIN"
            modal
            :style="{ width: '380px' }"
            class="dialog-compact max-w-[95vw]"
        >
            <div class="flex flex-col gap-3">
                <Message
                    v-if="fallbackReason"
                    severity="warn"
                    :closable="false"
                    >{{ fallbackReason }}</Message
                >
                <label class="text-sm font-medium">PIN</label>
                <SharedMaskedTextField
                    v-model="pin"
                    @keyup-enter="submitSync"
                />
            </div>
            <template #footer>
                <Button
                    v-if="canRetryPasskey"
                    label="Try passkey again"
                    severity="secondary"
                    text
                    @click="tryPasskeySync"
                />
                <Button
                    label="Cancel"
                    severity="secondary"
                    @click="pinDialogVisible = false"
                />
                <Button
                    label="Start Sync"
                    :loading="triggerPending"
                    @click="submitSync"
                />
            </template>
        </Dialog>
    </div>

    <!-- In-progress state (spinner stays visible in both variants) -->
    <div
        v-else
        class="flex h-10 items-center gap-2"
        :class="{ 'w-10 justify-center': iconOnly }"
        :title="iconOnly ? 'Syncing…' : undefined"
    >
        <ProgressSpinner
            style="width: 20px; height: 20px"
            stroke-width="4"
        />
        <span
            v-if="!iconOnly"
            class="text-sm"
            >Syncing{{ syncedCount !== null ? ` · ${syncedCount} txns` : "..." }}</span
        >
    </div>
</template>
