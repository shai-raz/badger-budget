<script setup lang="ts">
import type { IAccountResponse, ICurrencyResponse } from "@badger/types";
import { isLedgerAccountType } from "@badger/shared-data";
import { useToast } from "primevue/usetoast";
import { accountFallbackIcon } from "~/utils/avatarIcons";

const props = defineProps<{
    visible: boolean;
    account?: IAccountResponse | null;
}>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
    close: [];
}>();

const toast = useToast();
const apiClient = useApiClient();
const createMutation = useCreateAccount();
const updateMutation = useUpdateAccount();

const accountName = ref("");
const accountType = ref<string>("bank");
const accountIcon = ref("");
const accountColor = ref("#3B82F6");
const accountCurrencyId = ref<string | null>(null);
const saving = ref(false);

const accountTypeOptions = [
    { label: "Bank", value: "bank" },
    { label: "Credit Card", value: "credit_card" },
    { label: "Cash", value: "cash" },
    { label: "Savings", value: "savings" },
    { label: "Unknown", value: "unknown" },
];

const { data: currencies } = useQuery({
    queryKey: ["currencies"],
    queryFn: (): Promise<ICurrencyResponse[]> => apiClient.getCurrencies(),
});

const currencyOptions = computed(() => {
    if (!currencies.value) return [];
    return currencies.value.map((c: ICurrencyResponse) => ({
        label: `${c.code} — ${c.name}`,
        value: c.id,
    }));
});

const isEditMode = computed(() => !!props.account);
const dialogTitle = computed(() => (isEditMode.value ? "Edit account" : "New account"));
const apiError = ref<string | null>(null);

const isLedger = computed(() => isLedgerAccountType(accountType.value));
const currencyTouched = ref(false);
// Mirrors the API: a transaction pins a ledger account's currency; linked transfers also pin its type.
const isLedgerAccount = computed(() => isLedgerAccountType(props.account?.type));
const lockedCurrency = computed(() => isLedgerAccount.value && !!props.account?.hasTransactions);
const lockedType = computed(() => isLedgerAccount.value && !!props.account?.hasLinkedTransfers);
const currencyMissing = computed(() => isLedger.value && !accountCurrencyId.value);
const showCurrencyError = computed(() => currencyMissing.value && currencyTouched.value);

const canSave = computed(() => {
    return accountName.value.trim().length > 0 && accountType.value.length > 0 && !currencyMissing.value;
});

const resetForm = () => {
    accountName.value = "";
    accountType.value = "bank";
    accountIcon.value = "";
    accountColor.value = "#3B82F6";
    accountCurrencyId.value = null;
    currencyTouched.value = false;
};

const loadAccount = () => {
    if (props.account) {
        accountName.value = props.account.name;
        accountType.value = props.account.type;
        accountIcon.value = props.account.icon || "";
        accountColor.value = props.account.color || "#3B82F6";
        accountCurrencyId.value = props.account.currencyId || null;
        currencyTouched.value = false;
    } else {
        resetForm();
    }
};

watch(
    () => props.visible,
    (newValue) => {
        if (newValue) {
            loadAccount();
        }
    },
);

const handleClose = () => {
    emit("update:visible", false);
    emit("close");
    apiError.value = null;
    resetForm();
};

const handleSave = async () => {
    if (currencyMissing.value) {
        currencyTouched.value = true;
        return;
    }
    saving.value = true;
    apiError.value = null;

    try {
        const payload = {
            name: accountName.value.trim(),
            type: accountType.value,
            icon: accountIcon.value.trim() || undefined,
            color: accountColor.value.trim() || undefined,
            currencyId: accountCurrencyId.value || undefined,
        };

        if (isEditMode.value && props.account) {
            await updateMutation.mutateAsync({
                id: props.account.id,
                data: payload,
            });
            toast.add({
                severity: "success",
                summary: "Success",
                detail: "Account updated successfully",
                life: 3000,
            });
        } else {
            await createMutation.mutateAsync(payload);
            toast.add({
                severity: "success",
                summary: "Success",
                detail: "Account created successfully",
                life: 3000,
            });
        }
        handleClose();
    } catch (error) {
        apiError.value = getApiErrorMessage(error, `Could not ${isEditMode.value ? "update" : "create"} the account`);
    } finally {
        saving.value = false;
    }
};
</script>

<template>
    <SharedFormDialog
        :visible="visible"
        :header="dialogTitle"
        :busy="saving"
        :api-error="apiError"
        :initial-focus="isEditMode ? 'dialog' : 'field'"
        save-label="Save"
        :save-disabled="!canSave"
        @update:visible="handleClose"
        @save="handleSave"
    >
        <div class="flex flex-col gap-4">
            <div
                v-if="isEditMode && props.account?.accountNumber"
                class="flex flex-col gap-1"
            >
                <span class="block text-sm font-medium">Account Number</span>
                <span
                    class="text-sm text-muted-color font-mono px-3 py-2 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-md"
                >
                    {{ props.account.accountNumber }}
                </span>
                <span class="text-xs text-surface-400">Set by the bank — not editable</span>
            </div>

            <div>
                <label
                    for="account-name"
                    class="block text-sm font-medium mb-2"
                    >Account Name *</label
                >
                <InputText
                    id="account-name"
                    v-model="accountName"
                    placeholder="Enter account name"
                    class="w-full"
                    :autofocus="!isEditMode"
                />
            </div>

            <div>
                <label
                    for="account-type"
                    class="block text-sm font-medium mb-2"
                    >Account Type *</label
                >
                <Select
                    id="account-type"
                    v-model="accountType"
                    :options="accountTypeOptions"
                    option-label="label"
                    option-value="value"
                    placeholder="Select type"
                    class="w-full"
                    :disabled="lockedType"
                />
            </div>

            <div>
                <label
                    for="account-icon"
                    class="block text-sm font-medium mb-2"
                    >Icon (optional)</label
                >
                <div class="flex items-center gap-3">
                    <InputText
                        id="account-icon"
                        v-model="accountIcon"
                        placeholder="e.g. wallet"
                        class="flex-1"
                    />
                    <SharedEntityAvatar
                        :icon="accountIcon"
                        :color="accountColor"
                        :fallback="accountFallbackIcon(accountType)"
                    />
                </div>
                <p class="mt-1 text-xs text-muted-color">Leave empty to use the default icon.</p>
            </div>

            <div>
                <label
                    for="account-color"
                    class="block text-sm font-medium mb-2"
                    >Color (optional)</label
                >
                <div class="flex items-center gap-3">
                    <ColorPicker
                        v-model="accountColor"
                        format="hex"
                    />
                    <InputText
                        v-model="accountColor"
                        placeholder="#3B82F6"
                        class="flex-1"
                    />
                </div>
            </div>

            <div>
                <label
                    for="account-currency"
                    class="block text-sm font-medium mb-2"
                    >Currency{{ isLedger ? " *" : " (optional)" }}</label
                >
                <Select
                    id="account-currency"
                    v-model="accountCurrencyId"
                    :options="currencyOptions"
                    option-label="label"
                    option-value="value"
                    placeholder="Select currency"
                    class="w-full"
                    show-clear
                    filter
                    :disabled="lockedCurrency"
                    :invalid="showCurrencyError"
                    @update:model-value="currencyTouched = true"
                    @hide="currencyTouched = true"
                />
                <small
                    v-if="showCurrencyError"
                    class="block mt-1 text-red-500"
                    >Cash and savings accounts need a currency</small
                >
                <small
                    v-if="lockedType"
                    class="block mt-1 text-muted-color"
                    >This account has linked transfers, so its currency and type can't change.</small
                >
                <small
                    v-else-if="lockedCurrency"
                    class="block mt-1 text-muted-color"
                    >This account has transactions, so its currency can't change.</small
                >
            </div>
        </div>
    </SharedFormDialog>
</template>
