<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import { useGetCurrencies } from "~/composables/currencies/useCurrencies";
import { useBudgetFormDialog } from "~/composables/useBudgetFormDialog";
import { useCreateBudget, useGetBudget, useUpdateBudget } from "~/composables/useBudgets";
import { getApiErrorMessage } from "~/utils/apiError";
import { budgetToFormValues, type BudgetFormPayload } from "~/utils/budgetForm";

// Mounted once in layouts/app.vue. Open it through useBudgetFormDialog() from any page.
const { state, close } = useBudgetFormDialog();
const toast = useToast();

const isEdit = computed(() => state.value.budgetId !== null);
const { data: currencies } = useGetCurrencies();
const { data: budget, isLoading, error } = useGetBudget(computed(() => state.value.budgetId ?? ""));
const createMutation = useCreateBudget();
const updateMutation = useUpdateBudget();

const busy = computed(() => createMutation.isPending.value || updateMutation.isPending.value);
const apiError = ref<string | null>(null);
const formRef = ref<{ submit: () => BudgetFormPayload | null } | null>(null);

// A failed load has no budget and is not loading, so the error must win or the spinner never stops.
const loadingEdit = computed(() => isEdit.value && !error.value && (isLoading.value || !budget.value));
// A failed background refetch keeps the cached budget, so only an error with no budget is a load failure.
const loadFailed = computed(() => isEdit.value && !!error.value && !budget.value);
const ready = computed(() => !!currencies.value && !loadingEdit.value && !loadFailed.value);

const initial = computed(() => (isEdit.value && budget.value ? budgetToFormValues(budget.value) : undefined));

const onVisibleChange = (value: boolean) => {
    if (!value) close();
};

const handleSave = async () => {
    const payload = formRef.value?.submit();
    if (!payload) return;
    apiError.value = null;

    try {
        if (state.value.budgetId) {
            await updateMutation.mutateAsync({ id: state.value.budgetId, data: payload });
            close();
            toast.add({ severity: "success", summary: "Budget updated", life: 3000 });
        } else {
            await createMutation.mutateAsync(payload);
            close();
            toast.add({ severity: "success", summary: "Budget created", life: 3000 });
        }
    } catch (e) {
        apiError.value = getApiErrorMessage(e, "Could not save the budget");
    }
};
</script>

<template>
    <SharedFormDialog
        :visible="state.visible"
        :header="isEdit ? 'Edit budget' : 'New budget'"
        :initial-focus="isEdit ? 'dialog' : 'field'"
        :busy="busy"
        :api-error="apiError"
        :show-save="ready"
        @update:visible="onVisibleChange"
        @hide="apiError = null"
        @save="handleSave"
    >
        <div
            v-if="loadingEdit"
            class="flex justify-center py-8"
        >
            <ProgressSpinner style="width: 2.5rem; height: 2.5rem" />
        </div>

        <Message
            v-else-if="loadFailed"
            severity="error"
            :closable="false"
            >Could not load this budget.</Message
        >

        <BudgetsBudgetForm
            v-else-if="currencies"
            :key="state.openCount"
            ref="formRef"
            :currencies="currencies"
            :initial="initial"
            :autofocus-amount="!isEdit"
            :disabled="busy"
        />

        <div
            v-else
            class="flex justify-center py-8"
        >
            <ProgressSpinner style="width: 2.5rem; height: 2.5rem" />
        </div>
    </SharedFormDialog>
</template>
