<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import { BANK_PROVIDERS } from "@badger/shared-data";
import type { BankProvider } from "@badger/shared-data";
import type { IScraperConnectionResponse, IUpdateScraperConnection } from "@badger/types";
import { useQueryClient } from "@tanstack/vue-query";
import { bankSyncKeys } from "~/composables/bankSync/useBankSync";
import { STALE_PIN_MESSAGE, unlockFallbackMessage } from "~/utils/syncPasskeyWebAuthn";

const props = defineProps<{
    visible: boolean;
    connection?: IScraperConnectionResponse | null;
}>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
    close: [];
}>();

const toast = useToast();
const queryClient = useQueryClient();
const createMutation = useCreateScraperConnectionMutation();
const updateMutation = useUpdateScraperConnectionMutation();

const isEditMode = computed(() => !!props.connection);

// Form state
const selectedCompanyId = ref<string | null>(null);
const displayName = ref("");
const credentials = ref<Record<string, string>>({});
const scrapeLookbackDays = ref(60);
const syncPin = ref("");
const saving = ref(false);
const apiError = ref<string | null>(null);

const { isWebAuthnAvailable, unlock } = useSyncUnlock();
const { data: passkeys } = useSyncPasskeysQuery();
const usePinInstead = ref(false);
const pinFallbackReason = ref<string | null>(null);
const hasPasskeys = computed(() => (passkeys.value?.length ?? 0) > 0);
const passkeyMode = computed(
    () => isWebAuthnAvailable() && hasPasskeys.value && !usePinInstead.value && !syncPin.value,
);

const usePin = (reason: string | null = null) => {
    usePinInstead.value = true;
    pinFallbackReason.value = reason;
};
const tryPasskeyAgain = () => {
    usePinInstead.value = false;
    pinFallbackReason.value = null;
    syncPin.value = "";
};

const providerOptions = BANK_PROVIDERS.map((p: BankProvider) => ({
    label: p.name,
    value: p.companyId,
}));

const selectedProvider = computed<BankProvider | null>(() => {
    if (!selectedCompanyId.value) return null;
    return (BANK_PROVIDERS.find((p: BankProvider) => p.companyId === selectedCompanyId.value) ??
        null) as BankProvider | null;
});

const fieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
        userCode: "User Code",
        username: "Username",
        password: "Password",
        id: "ID Number",
        num: "Identification Code",
        card6Digits: "Last 6 Card Digits",
        nationalID: "National ID",
    };
    return labels[field] ?? field;
};

const isPasswordField = (field: string): boolean => field === "password";

// When provider changes in create mode, reset credentials and pre-fill display name
watch(selectedCompanyId, (newId) => {
    if (isEditMode.value) return;
    const provider = BANK_PROVIDERS.find((p: BankProvider) => p.companyId === newId);
    if (provider) {
        displayName.value = provider.name;
        credentials.value = {};
    }
});

// Prefill form when opening in edit mode
watch(
    () => props.visible,
    (visible) => {
        if (visible) tryPasskeyAgain();
        if (visible && props.connection) {
            selectedCompanyId.value = props.connection.companyId;
            displayName.value = props.connection.displayName;
            scrapeLookbackDays.value = props.connection.scrapeLookbackDays;
            credentials.value = {};
            syncPin.value = "";
        }
    },
);

// Whether the user has started filling in any credential field
const credentialsTouched = computed(() => {
    if (!selectedProvider.value) return false;
    return selectedProvider.value.loginFields.some((field: string) => !!credentials.value[field]);
});

const canSave = computed(() => {
    if (!displayName.value.trim()) return false;

    if (!isEditMode.value) {
        // Create: all fields required
        if (!selectedCompanyId.value || (!passkeyMode.value && !syncPin.value)) return false;
        if (!selectedProvider.value) return false;
        return selectedProvider.value.loginFields.every((field: string) => !!credentials.value[field]);
    }

    // Edit: displayName required; credentials optional but all-or-nothing + PIN
    if (credentialsTouched.value) {
        if (!passkeyMode.value && !syncPin.value) return false;
        if (!selectedProvider.value) return false;
        return selectedProvider.value.loginFields.every((field: string) => !!credentials.value[field]);
    }

    return true;
});

const resetForm = () => {
    selectedCompanyId.value = null;
    displayName.value = "";
    credentials.value = {};
    scrapeLookbackDays.value = 60;
    syncPin.value = "";
    tryPasskeyAgain();
};

const handleClose = () => {
    emit("update:visible", false);
    emit("close");
    apiError.value = null;
    resetForm();
};

const handleSave = async () => {
    if (!canSave.value) return;

    const pinNeeded = !isEditMode.value || credentialsTouched.value;
    let pin = syncPin.value;
    let pinFromPasskey = false;

    saving.value = true;
    apiError.value = null;
    try {
        if (pinNeeded && passkeyMode.value) {
            try {
                pin = await unlock(passkeys.value);
                pinFromPasskey = true;
            } catch (error: unknown) {
                const reason = unlockFallbackMessage(error, false);
                if (reason) {
                    usePin(reason);
                    return;
                }
                throw error;
            }
        }

        if (isEditMode.value && props.connection) {
            const data: IUpdateScraperConnection = {
                displayName: displayName.value.trim(),
                scrapeLookbackDays: scrapeLookbackDays.value,
            };
            if (credentialsTouched.value) {
                data.pin = pin;
                data.credentials = { ...credentials.value };
            }
            await updateMutation.mutateAsync({ id: props.connection.id, data });
            toast.add({
                severity: "success",
                summary: "Success",
                detail: "Bank connection updated successfully",
                life: 3000,
            });
        } else {
            if (!selectedCompanyId.value || !selectedProvider.value) return;
            await createMutation.mutateAsync({
                pin,
                companyId: selectedCompanyId.value,
                displayName: displayName.value.trim(),
                credentials: { ...credentials.value },
                scrapeLookbackDays: scrapeLookbackDays.value,
            });
            toast.add({
                severity: "success",
                summary: "Success",
                detail: "Bank connection added successfully",
                life: 3000,
            });
        }
        handleClose();
    } catch (error) {
        const staleReason = unlockFallbackMessage(error, pinFromPasskey);
        if (staleReason) {
            if (staleReason === STALE_PIN_MESSAGE) {
                void queryClient.invalidateQueries({ queryKey: bankSyncKeys.passkeys() });
            }
            usePin(staleReason);
            return;
        }
        apiError.value = getApiErrorMessage(
            error,
            isEditMode.value ? "Failed to update bank connection" : "Failed to add bank connection",
        );
    } finally {
        saving.value = false;
    }
};
</script>

<template>
    <SharedFormDialog
        :visible="visible"
        :header="isEditMode ? 'Edit bank connection' : 'Add bank connection'"
        :busy="saving"
        :api-error="apiError"
        :initial-focus="isEditMode ? 'dialog' : 'field'"
        :save-label="isEditMode ? 'Save changes' : 'Add connection'"
        :save-disabled="!canSave"
        @update:visible="handleClose"
        @save="handleSave"
    >
        <div class="flex flex-col gap-4">
            <div>
                <label class="block text-sm font-medium mb-2">Bank / Provider</label>
                <Select
                    v-if="!isEditMode"
                    v-model="selectedCompanyId"
                    :options="providerOptions"
                    option-label="label"
                    option-value="value"
                    placeholder="Select a bank"
                    class="w-full"
                    filter
                    :pt="{ label: { autofocus: true } }"
                />
                <div
                    v-else
                    class="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-100 dark:bg-surface-800"
                >
                    <span class="text-sm font-medium">{{ selectedProvider?.name ?? selectedCompanyId }}</span>
                    <Tag
                        value="Locked"
                        severity="secondary"
                        class="text-xs"
                    />
                </div>
            </div>

            <div v-if="selectedCompanyId">
                <label class="block text-sm font-medium mb-2">Display Name *</label>
                <InputText
                    v-model="displayName"
                    placeholder="Display name"
                    class="w-full"
                />
            </div>

            <template v-if="selectedProvider">
                <div
                    v-if="isEditMode"
                    class="flex items-center gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-sm"
                >
                    <i class="pi pi-info-circle" />
                    <span>Leave credentials blank to keep existing ones. Fill them all to update.</span>
                </div>

                <div
                    v-for="field in selectedProvider.loginFields"
                    :key="field"
                >
                    <label class="block text-sm font-medium mb-2">
                        {{ fieldLabel(field) }}
                        <span v-if="!isEditMode">*</span>
                        <span
                            v-else
                            class="text-surface-400 font-normal ml-1"
                            >(optional)</span
                        >
                    </label>
                    <Password
                        v-if="isPasswordField(field)"
                        v-model="credentials[field]"
                        :feedback="false"
                        toggle-mask
                        class="w-full"
                        input-class="w-full"
                        :input-props="{ autocomplete: 'new-password' }"
                    />
                    <InputText
                        v-else
                        v-model="credentials[field]"
                        :placeholder="fieldLabel(field)"
                        class="w-full"
                        autocomplete="new-password"
                    />
                </div>

                <div>
                    <label class="block text-sm font-medium mb-2">Days to Scrape Back *</label>
                    <InputNumber
                        v-model="scrapeLookbackDays"
                        :min="1"
                        :max="365"
                        class="w-full"
                        input-class="w-full"
                    />
                </div>

                <div v-if="passkeyMode">
                    <p
                        v-if="!isEditMode || credentialsTouched"
                        class="text-sm text-muted-color mb-1"
                    >
                        Your passkey will be used to encrypt these credentials.
                    </p>
                    <Button
                        label="Use PIN instead"
                        link
                        size="small"
                        class="p-0"
                        @click="usePin()"
                    />
                </div>
                <div v-else>
                    <p
                        v-if="pinFallbackReason"
                        class="text-sm text-orange-600 dark:text-orange-400 mb-2"
                    >
                        {{ pinFallbackReason }}
                    </p>
                    <label class="block text-sm font-medium mb-2">
                        Sync PIN
                        <span v-if="!isEditMode || credentialsTouched">*</span>
                        <span
                            v-else
                            class="text-surface-400 font-normal ml-1"
                            >(required only when updating credentials)</span
                        >
                    </label>
                    <SharedMaskedTextField
                        v-model="syncPin"
                        placeholder="Enter your sync PIN to encrypt credentials"
                    />
                    <Button
                        v-if="hasPasskeys && usePinInstead"
                        label="Try passkey again"
                        link
                        size="small"
                        class="p-0 mt-1"
                        @click="tryPasskeyAgain"
                    />
                </div>
            </template>
        </div>
    </SharedFormDialog>
</template>
