<script setup lang="ts">
import { useBankSyncFlow } from "~/composables/bankSync/useBankSyncFlow";
const {
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
} = useBankSyncFlow();
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

    <Dialog
        v-model:visible="pinDialogVisible"
        header="Enter sync PIN"
        modal
        :closable="!triggerPending"
        :close-on-escape="!triggerPending"
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
                :disabled="triggerPending"
                severity="secondary"
                @click="cancelSync"
            />
            <Button
                label="Start sync"
                :loading="triggerPending"
                @click="submitSync"
            />
        </template>
    </Dialog>
</template>
