<script setup lang="ts">
import { MAX_PASSKEYS } from "@badger/shared-data";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { SyncUnlockError } from "../../composables/bankSync/useSyncUnlock";
import { UNSUPPORTED_MESSAGE } from "../../utils/syncPasskeyWebAuthn";

interface HttpError {
    response?: { status?: number; data?: { message?: string } };
}

const toast = useToast();
const confirm = useConfirm();
const { isWebAuthnAvailable, register } = useSyncUnlock();
const { data: pinStatus } = useSyncPinStatusQuery();
const { data: passkeys, isLoading } = useSyncPasskeysQuery();
const deleteMutation = useDeleteSyncPasskeyMutation();

const hasPinSet = computed(() => pinStatus.value?.hasPinSet === true);
const webAuthnAvailable = computed(() => isWebAuthnAvailable());
const list = computed(() => passkeys.value ?? []);
const canAdd = computed(() => list.value.length < MAX_PASSKEYS);

const dialogVisible = ref(false);
const pin = ref("");
const submitting = ref(false);
const pinError = ref("");

const closeDialog = () => {
    dialogVisible.value = false;
};

// Always clear the PIN when the dialog closes, however it was dismissed.
watch(dialogVisible, (visible) => {
    if (!visible) {
        pin.value = "";
        pinError.value = "";
    }
});

const openDialog = () => {
    pin.value = "";
    pinError.value = "";
    dialogVisible.value = true;
};

const submit = async () => {
    if (submitting.value) return;
    if (!pin.value) {
        pinError.value = "Enter your sync PIN";
        return;
    }
    pinError.value = "";
    submitting.value = true;
    try {
        await register(pin.value);
        closeDialog();
        toast.add({ severity: "success", summary: "Passkey added", life: 3000 });
    } catch (err: unknown) {
        if (err instanceof SyncUnlockError) {
            if (err.reason === "cancelled") {
                toast.add({ severity: "info", summary: "Passkey setup cancelled", life: 3000 });
            } else if (err.reason === "unsupported") {
                toast.add({ severity: "error", summary: "Error", detail: UNSUPPORTED_MESSAGE, life: 5000 });
            } else if (err.reason === "already-registered") {
                toast.add({
                    severity: "warn",
                    summary: "This device already has a sync passkey",
                    life: 5000,
                });
            } else {
                toast.add({ severity: "error", summary: "Error", detail: "Failed to add passkey", life: 5000 });
            }
        } else {
            const httpErr = err as HttpError;
            const status = httpErr.response?.status;
            if (status === 401) {
                pinError.value = "Incorrect PIN";
            } else if (status === 409 || status === 400) {
                pinError.value = httpErr.response?.data?.message || "Failed to add passkey";
            } else {
                toast.add({
                    severity: "error",
                    summary: "Error",
                    detail: (err as HttpError).response?.data?.message || "Failed to add passkey",
                    life: 5000,
                });
            }
        }
    } finally {
        submitting.value = false;
    }
};

const handleRemove = (id: string) => {
    confirm.require({
        message: "Remove this passkey? You'll need your PIN to sync on that device.",
        header: "Remove passkey",
        icon: "pi pi-exclamation-triangle",
        rejectLabel: "Cancel",
        acceptLabel: "Remove",
        acceptClass: "p-button-danger",
        accept: async () => {
            try {
                await deleteMutation.mutateAsync(id);
                toast.add({ severity: "success", summary: "Success", detail: "Passkey removed", life: 3000 });
            } catch (err: unknown) {
                toast.add({
                    severity: "error",
                    summary: "Error",
                    detail: (err as HttpError).response?.data?.message || "Failed to remove passkey",
                    life: 5000,
                });
            }
        },
    });
};
</script>

<template>
    <SharedSectionBand title="Sync passkeys">
        <div class="px-4 pb-4 md:px-0 md:pb-0">
            <p
                v-if="!hasPinSet"
                class="text-surface-600 dark:text-surface-300"
            >
                Set up a bank connection with a sync PIN first to use passkeys.
            </p>
            <template v-else>
                <p class="text-surface-600 dark:text-surface-300 mb-3">
                    Unlock bank sync with your fingerprint, face or device lock instead of typing your PIN.
                </p>
                <p
                    v-if="!webAuthnAvailable"
                    class="text-surface-600 dark:text-surface-300 mb-3"
                >
                    This browser doesn't support passkeys.
                </p>

                <ul
                    v-if="list.length"
                    class="list-none p-0 m-0 mb-3 flex flex-col gap-2"
                >
                    <li
                        v-for="passkey in list"
                        :key="passkey.id"
                        class="flex items-center justify-between gap-2"
                    >
                        <div class="min-w-0">
                            <p class="font-medium truncate">{{ passkey.label }}</p>
                            <p class="text-sm text-surface-600 dark:text-surface-300">
                                {{ new Date(passkey.createdAt).toLocaleDateString() }}
                            </p>
                        </div>
                        <Button
                            icon="pi pi-trash"
                            severity="danger"
                            text
                            rounded
                            aria-label="Remove passkey"
                            :disabled="deleteMutation.isPending.value"
                            @click="handleRemove(passkey.id)"
                        />
                    </li>
                </ul>
                <p
                    v-else-if="!isLoading"
                    class="text-surface-600 dark:text-surface-300 mb-3"
                >
                    No passkeys yet.
                </p>

                <Button
                    v-if="canAdd"
                    label="Add passkey"
                    icon="pi pi-key"
                    :disabled="!webAuthnAvailable"
                    @click="openDialog"
                />
                <p
                    v-else
                    class="text-sm text-surface-600 dark:text-surface-300"
                >
                    You've reached the maximum of {{ MAX_PASSKEYS }} passkeys; remove one to add another.
                </p>
            </template>

            <Dialog
                v-model:visible="dialogVisible"
                header="Add passkey"
                modal
                :style="{ width: '380px' }"
                class="dialog-compact max-w-[95vw]"
            >
                <div class="flex flex-col gap-3">
                    <p class="text-sm text-surface-600 dark:text-surface-300">
                        Enter your sync PIN to link it to a passkey on this device. You may be asked for biometrics
                        twice.
                    </p>
                    <label class="text-sm font-medium">PIN</label>
                    <SharedMaskedTextField
                        v-model="pin"
                        @keyup-enter="submit"
                    />
                    <small
                        v-if="pinError"
                        class="text-red-500"
                        role="alert"
                        >{{ pinError }}</small
                    >
                </div>
                <template #footer>
                    <Button
                        label="Cancel"
                        severity="secondary"
                        :disabled="submitting"
                        @click="closeDialog"
                    />
                    <Button
                        label="Add passkey"
                        :loading="submitting"
                        @click="submit"
                    />
                </template>
            </Dialog>
        </div>
    </SharedSectionBand>
</template>
