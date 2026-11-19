<script setup lang="ts">
import type { ISyncPasskey } from "@badger/types";
import { MAX_PASSKEYS } from "@badger/shared-data";
import type { MenuItem } from "primevue/menuitem";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { SyncUnlockError, useSyncUnlock } from "../../composables/bankSync/useSyncUnlock";
import {
    useDeleteSyncPasskeyMutation,
    useSyncPasskeysQuery,
    useSyncPinStatusQuery,
} from "../../composables/bankSync/useBankSync";
import { isPhoneLabel } from "../../utils/deviceLabel";
import { clearDeviceCredentialId, getDeviceCredentialId } from "../../utils/syncPasskeyDeviceFlags";
import { UNSUPPORTED_MESSAGE } from "../../utils/syncPasskeyWebAuthn";
import { useAuthStore } from "~/stores/auth";

interface HttpError {
    response?: { status?: number; data?: { message?: string } };
}

definePageMeta({
    layout: "app",
    fullBleed: true,
});

const toast = useToast();
const confirm = useConfirm();
const authStore = useAuthStore();
const { isWebAuthnAvailable, register } = useSyncUnlock();
const { data: pinStatus, isLoading: pinLoading, error: pinStatusError } = useSyncPinStatusQuery();
const { data: passkeys, isLoading: passkeysLoading, error: passkeysError } = useSyncPasskeysQuery();
const deleteMutation = useDeleteSyncPasskeyMutation();

const userId = authStore.user?.id;
// The credential id of the passkey this browser registered or last unlocked with, for the "This device" tag.
const deviceCredentialId = ref(userId ? getDeviceCredentialId(userId) : null);

const hasPinSet = computed(() => pinStatus.value?.hasPinSet === true);
const webAuthnAvailable = computed(() => isWebAuthnAvailable());
const list = computed(() => passkeys.value ?? []);
const canAdd = computed(() => list.value.length < MAX_PASSKEYS);
const emptyText = computed(() =>
    webAuthnAvailable.value
        ? "No passkeys yet. Add one to unlock bank sync with your fingerprint, face or screen lock."
        : "No passkeys yet. This browser can't create passkeys, so add one from a browser that supports them.",
);

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
        if (userId) deviceCredentialId.value = getDeviceCredentialId(userId);
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

const handleRemove = (passkey: Pick<ISyncPasskey, "id" | "credentialId">) => {
    confirm.require({
        message: "Remove this passkey? You'll need your PIN to sync on that device.",
        header: "Remove passkey",
        icon: "pi pi-exclamation-triangle",
        rejectLabel: "Cancel",
        acceptLabel: "Remove",
        acceptClass: "p-button-danger",
        accept: async () => {
            try {
                await deleteMutation.mutateAsync(passkey.id);
                if (userId && passkey.credentialId === deviceCredentialId.value) {
                    clearDeviceCredentialId(userId);
                    deviceCredentialId.value = null;
                }
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

// One ⋮ menu for the passkey list, pointed at the row it was opened from.
const menu = ref();
const selectedPasskey = ref<ISyncPasskey | null>(null);
const passkeyMenuItems = computed<MenuItem[]>(() => [
    {
        label: "Remove passkey",
        icon: "pi pi-trash",
        class: "text-red-500",
        command: () => {
            if (selectedPasskey.value) handleRemove(selectedPasskey.value);
        },
    },
]);

function openPasskeyMenu(event: Event, passkey: ISyncPasskey) {
    selectedPasskey.value = passkey;
    menu.value?.toggle(event);
}

const addedLabel = (createdAt: string) =>
    new Date(createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader
            title="Sync passkeys"
            back-to="/settings"
        >
            <template #actions>
                <LayoutHeaderButton
                    v-if="hasPinSet"
                    label="New"
                    icon="pi pi-plus"
                    primary
                    aria-label="New passkey"
                    :disabled="!webAuthnAvailable || !canAdd"
                    @click="openDialog"
                />
            </template>
        </LayoutPageHeader>

        <SharedSectionBand
            title="Passkeys"
            heading-id="passkeys-heading"
            :loading="pinLoading || (hasPinSet && passkeysLoading)"
            :error="pinStatusError ?? passkeysError"
            :empty="hasPinSet && !passkeysLoading && !list.length"
            empty-icon="pi-key"
            :empty-text="emptyText"
        >
            <template v-if="!hasPinSet">
                <Message
                    severity="info"
                    class="mx-4 mb-4 md:mx-0 md:mb-0"
                >
                    <strong>Set a sync PIN first.</strong> Passkeys unlock the PIN you choose when you add a bank
                    connection.
                </Message>
                <div class="px-4 pb-4 md:px-0 md:pb-0">
                    <NuxtLink
                        to="/bank-connections"
                        class="text-sm font-semibold text-primary hover:underline"
                    >
                        Go to bank connections
                    </NuxtLink>
                </div>
            </template>

            <template v-else>
                <p class="px-4 pb-2 text-sm text-muted-color md:px-0">
                    Unlock bank sync with your fingerprint, face or screen lock instead of typing your sync PIN.
                </p>
                <p
                    v-if="!webAuthnAvailable"
                    class="px-4 pb-2 text-sm text-muted-color md:px-0"
                >
                    This browser can't create passkeys. You can still remove the ones you have.
                </p>
                <p
                    v-if="!canAdd"
                    class="px-4 pb-2 text-sm text-muted-color md:px-0"
                >
                    You've reached the limit of {{ MAX_PASSKEYS }} passkeys. Remove one to add another.
                </p>

                <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
                    <div
                        v-for="passkey in list"
                        :key="passkey.id"
                        class="flex items-center gap-3 px-4 py-3 md:px-0"
                    >
                        <i
                            :class="isPhoneLabel(passkey.label) ? 'pi pi-mobile' : 'pi pi-desktop'"
                            class="text-muted-color"
                            aria-hidden="true"
                        />
                        <div class="flex min-w-0 flex-1 flex-col gap-1">
                            <div class="flex min-w-0 items-center gap-2">
                                <span class="truncate text-sm font-semibold">{{ passkey.label }}</span>
                                <SharedStatusTag
                                    v-if="passkey.credentialId === deviceCredentialId"
                                    value="This device"
                                />
                            </div>
                            <span class="text-xs text-muted-color">Added {{ addedLabel(passkey.createdAt) }}</span>
                        </div>
                        <Button
                            icon="pi pi-ellipsis-v"
                            text
                            rounded
                            size="small"
                            aria-haspopup="menu"
                            :aria-label="`Actions for ${passkey.label}`"
                            :disabled="deleteMutation.isPending.value"
                            class="shrink-0 text-muted-color"
                            @click="openPasskeyMenu($event, passkey)"
                        />
                    </div>
                </div>
                <Menu
                    ref="menu"
                    :model="passkeyMenuItems"
                    popup
                />
            </template>
        </SharedSectionBand>

        <Dialog
            v-model:visible="dialogVisible"
            header="Add passkey"
            modal
            :style="{ width: '380px' }"
            class="dialog-compact max-w-[95vw]"
        >
            <div class="flex flex-col gap-3">
                <p class="text-sm text-surface-600 dark:text-surface-300">
                    Enter your sync PIN to link it to a passkey on this device. You may be asked for biometrics twice.
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
</template>
