<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import TransactionForm from "./TransactionForm.vue";
import { useCreateTransaction } from "../../composables/transactions/useTransactions";
import { useCreateCategoryMutation } from "../../composables/categories/useCreateCategory.mutation";
import { getApiErrorMessage } from "../../utils/apiError";
import { saveWithPendingCategory } from "../../utils/pendingCategory";
import { cashFollowupFor, type TransactionFormPrefill } from "../../utils/transactionForm";
import { showCashFollowupToast } from "../../utils/cashFollowupToast";

defineProps<{
    visible: boolean;
    prefill?: TransactionFormPrefill;
}>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
}>();

const toast = useToast();
const router = useRouter();

const { data: accounts, isLoading: accountsLoading } = useGetAccounts();
const { data: currencies, isLoading: currenciesLoading } = useGetCurrencies();
const { mutateAsync, isPending } = useCreateTransaction();
const { mutateAsync: createCategory, isPending: creatingCategory } = useCreateCategoryMutation();
const busy = computed(() => isPending.value || creatingCategory.value);

const formRef = ref<InstanceType<typeof TransactionForm> | null>(null);
const apiError = ref<string | null>(null);
const customiseOpen = ref(false);

const loading = computed(() => accountsLoading.value || currenciesLoading.value);
const noAccounts = computed(() => !!accounts.value && accounts.value.length === 0);
const ready = computed(() => !!accounts.value && !!currencies.value && accounts.value.length > 0);

const close = () => emit("update:visible", false);

const handleSave = async () => {
    const payload = formRef.value?.submit();
    if (!payload) return;
    apiError.value = null;
    try {
        const created = await saveWithPendingCategory({
            pending: formRef.value!.pendingCategory(),
            createCategory,
            onCategoryCreated: (id) => formRef.value?.adoptCategory(id),
            save: (catId) => mutateAsync(catId ? { ...payload, categoryId: catId } : payload),
        });
        close();
        const followup = cashFollowupFor(created);
        if (followup) showCashFollowupToast(toast, followup, currencies.value);
        else toast.add({ severity: "success", summary: "Transaction saved", life: 3000 });
        await router.push(`/transactions/${created.id}`);
    } catch (e) {
        apiError.value = getApiErrorMessage(e, "Could not save the transaction");
    }
};
</script>

<template>
    <SharedFormDialog
        :visible="visible"
        header="New transaction"
        :busy="busy"
        :api-error="apiError"
        initial-focus="field"
        :cancel-label="ready ? 'Cancel' : 'Close'"
        :show-save="ready"
        :suspend-escape="customiseOpen"
        @update:visible="emit('update:visible', $event)"
        @hide="apiError = null"
        @save="handleSave"
    >
        <div
            v-if="loading"
            class="flex justify-center py-8"
        >
            <ProgressSpinner style="width: 2.5rem; height: 2.5rem" />
        </div>

        <div
            v-else-if="noAccounts"
            class="flex flex-col items-center gap-3 py-8 text-center"
        >
            <i class="pi pi-wallet text-4xl text-muted-color"></i>
            <p class="m-0 font-semibold">Add an account first</p>
            <p class="m-0 text-sm text-muted-color">Transactions belong to an account.</p>
            <NuxtLink
                to="/accounts"
                @click="close"
            >
                <Button
                    label="Go to accounts"
                    icon="pi pi-arrow-right"
                    icon-pos="right"
                    size="small"
                />
            </NuxtLink>
        </div>

        <TransactionForm
            v-else-if="ready"
            ref="formRef"
            :accounts="accounts!"
            :currencies="currencies!"
            :disabled="busy"
            :prefill="prefill"
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
