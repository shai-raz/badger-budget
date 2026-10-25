<script setup lang="ts">
import type { ITransactionResponse } from "@badger/types";
import { useToast } from "primevue/usetoast";
import TransactionForm from "./TransactionForm.vue";
import { getApiErrorMessage } from "../../utils/apiError";
import { applyUpdateToTransaction, cashFollowupFor, type UpdateTransactionPayload } from "../../utils/transactionForm";
import { showCashFollowupToast } from "../../utils/cashFollowupToast";
import { saveWithPendingCategory } from "../../utils/pendingCategory";
import { useCreateCategoryMutation } from "../../composables/categories/useCreateCategory.mutation";
import { editDialogReimbursementLine } from "../../utils/reimbursement";

const props = defineProps<{
    visible: boolean;
    transaction: ITransactionResponse | null;
}>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
    createRule: [transaction: ITransactionResponse];
}>();

const toast = useToast();

const { data: accounts, isLoading: accountsLoading } = useGetAccounts();
const { data: currencies, isLoading: currenciesLoading } = useGetCurrencies();
const { mutateAsync, isPending } = useUpdateTransactionMutation();
const { mutateAsync: createCategory, isPending: creatingCategory } = useCreateCategoryMutation();
const busy = computed(() => isPending.value || creatingCategory.value);

const formRef = ref<InstanceType<typeof TransactionForm> | null>(null);
const apiError = ref<string | null>(null);
const dirty = ref(false);
const customiseOpen = ref(false);
const savingForRule = ref(false);

const loading = computed(() => accountsLoading.value || currenciesLoading.value);
const ready = computed(() => !!accounts.value && !!currencies.value && !!props.transaction);

const close = () => emit("update:visible", false);

const route = useRoute();
const reimbursementLine = computed(() => (props.transaction ? editDialogReimbursementLine(props.transaction) : null));

/** Opens the row's detail page, where reimbursements are managed. */
const manageReimbursements = () => {
    const tx = props.transaction;
    if (!tx) return;
    const target = `/transactions/${tx.id}`;
    close();
    if (route.path !== target) void navigateTo(target);
};

const handleHide = () => {
    apiError.value = null;
    dirty.value = false;
};

const handleSave = async (opts: { thenCreateRule?: boolean } = {}) => {
    const transaction = props.transaction;
    if (!transaction) return;
    const data = formRef.value?.submitUpdate();
    if (!data) return;
    apiError.value = null;
    savingForRule.value = !!opts.thenCreateRule;
    let savedData: UpdateTransactionPayload = data;
    try {
        const saved = (await saveWithPendingCategory({
            pending: formRef.value!.pendingCategory(),
            createCategory,
            onCategoryCreated: (id) => formRef.value?.adoptCategory(id),
            save: (catId) => {
                savedData = catId ? { ...data, categoryId: catId } : data;
                return mutateAsync({ id: transaction.id, data: savedData });
            },
        })) as ITransactionResponse | undefined;
        close();
        const followup = saved ? cashFollowupFor(saved, transaction) : null;
        if (followup) showCashFollowupToast(toast, followup, currencies.value);
        else toast.add({ severity: "success", summary: "Transaction updated", life: 3000 });
        if (opts.thenCreateRule) emit("createRule", applyUpdateToTransaction(transaction, savedData));
    } catch (e) {
        apiError.value = getApiErrorMessage(e, "Could not save the transaction");
    } finally {
        savingForRule.value = false;
    }
};

const handleCreateRule = () => {
    if (!props.transaction) return;
    if (dirty.value) void handleSave({ thenCreateRule: true });
    else emit("createRule", props.transaction);
};
</script>

<template>
    <SharedFormDialog
        :visible="visible"
        header="Edit transaction"
        :busy="busy"
        :api-error="apiError"
        initial-focus="dialog"
        :cancel-label="ready ? 'Cancel' : 'Close'"
        :show-save="ready"
        :save-disabled="!dirty"
        :save-loading="busy && !savingForRule"
        :suspend-escape="customiseOpen"
        @update:visible="emit('update:visible', $event)"
        @hide="handleHide"
        @save="handleSave()"
    >
        <p
            v-if="ready && reimbursementLine"
            class="m-0 text-sm text-muted-color"
        >
            {{ reimbursementLine }} &middot;
            <button
                type="button"
                class="text-primary hover:underline"
                @click="manageReimbursements"
            >
                Manage
            </button>
        </p>

        <div
            v-if="loading"
            class="flex justify-center py-8"
        >
            <ProgressSpinner style="width: 2.5rem; height: 2.5rem" />
        </div>

        <TransactionForm
            v-else-if="ready"
            :key="transaction!.id"
            ref="formRef"
            :transaction="transaction"
            :accounts="accounts!"
            :currencies="currencies!"
            :disabled="busy"
            :create-rule-loading="savingForRule"
            @dirty-change="dirty = $event"
            @create-rule="handleCreateRule"
            @customise-open-change="customiseOpen = $event"
        />

        <Message
            v-else
            severity="error"
            :closable="false"
            >Could not load accounts or currencies.</Message
        >
    </SharedFormDialog>
</template>
