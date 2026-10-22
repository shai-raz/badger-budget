<script setup lang="ts">
import type { ITransactionReimbursementLink, ITransactionResponse } from "@badger/types";
import { useUpdateReimbursement } from "../../composables/transactions/useReimbursements";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatCurrency } from "../../utils/currency";
import { maxLinkAmount } from "../../utils/reimbursement";

const props = defineProps<{
    visible: boolean;
    /** The row the band belongs to (an expense or an income). */
    transaction: ITransactionResponse;
    link: ITransactionReimbursementLink | null;
}>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
}>();

const { mutateAsync, isPending } = useUpdateReimbursement();

const amount = ref<number | null>(null);
const apiError = ref<string | null>(null);

const code = computed(() => props.transaction.currency.code);
const max = computed(() => (props.link ? maxLinkAmount(props.transaction, props.link) : 0));

// Compare in cents so 0.1 + 0.2 style float noise can't reject a value that is exactly the cap.
const isValid = computed(() => {
    if (amount.value === null || !props.link) return false;
    const cents = Math.round(amount.value * 100);
    return cents >= 1 && cents <= Math.round(max.value * 100);
});

watch(
    () => props.visible,
    (open) => {
        if (!open) return;
        amount.value = props.link?.amount ?? null;
        apiError.value = null;
    },
);

const handleSave = async () => {
    if (!props.link || amount.value === null || !isValid.value) return;
    apiError.value = null;
    try {
        await mutateAsync({ id: props.link.allocationId, amount: amount.value });
        emit("update:visible", false);
    } catch (error) {
        apiError.value = getApiErrorMessage(error, "Could not update the reimbursement");
    }
};
</script>

<template>
    <SharedFormDialog
        :visible="visible"
        header="Edit amount"
        :busy="isPending"
        :api-error="apiError"
        initial-focus="dialog"
        :save-disabled="!isValid"
        @update:visible="emit('update:visible', $event)"
        @save="handleSave"
    >
        <div
            v-if="link"
            class="flex flex-col gap-2"
        >
            <label
                for="reimbursement-amount"
                class="text-sm font-medium"
                >Amount</label
            >
            <InputNumber
                v-model="amount"
                input-id="reimbursement-amount"
                mode="decimal"
                locale="en-US"
                :min-fraction-digits="2"
                :max-fraction-digits="2"
                :min="0.01"
                :max="max"
                fluid
                :invalid="amount !== null && !isValid"
                :disabled="isPending"
            />
            <small class="text-muted-color">Up to {{ formatCurrency(max, code) }}.</small>
        </div>
    </SharedFormDialog>
</template>
