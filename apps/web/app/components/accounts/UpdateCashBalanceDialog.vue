<script setup lang="ts">
import type { IAccountResponse } from "@badger/types";
import { useToast } from "primevue/usetoast";
import { toLocalIsoDate } from "~/utils/localDate";

const props = defineProps<{
    visible: boolean;
    account: IAccountResponse | null;
}>();

const emit = defineEmits<{ "update:visible": [value: boolean] }>();

const toast = useToast();
const isDesktop = useIsDesktop();
const mutation = useUpdateCashBalance();

const amount = ref<number | null>(null);
const errorMessage = ref("");

const currencySymbol = computed(() => props.account?.currency?.symbol);
const canSubmit = computed(() => amount.value !== null && !mutation.isPending.value);

watch(
    () => props.visible,
    (open) => {
        if (!open) return;
        errorMessage.value = "";
        const a = props.account;
        amount.value = a && a.balanceKind === "cash_on_hand" && a.balance != null && a.balance >= 0 ? a.balance : null;
    },
    { immediate: true },
);

const close = () => emit("update:visible", false);

const submit = async () => {
    if (!props.account || amount.value === null) return;
    errorMessage.value = "";
    try {
        const res = await mutation.mutateAsync({
            id: props.account.id,
            data: { amount: amount.value, date: toLocalIsoDate(new Date()) },
        });
        close();
        toast.add({
            severity: "success",
            summary: "Cash balance updated",
            detail: formatCurrency(res.account.balance ?? 0, res.account.currency?.code),
            life: 3000,
        });
    } catch (e) {
        errorMessage.value = getApiErrorMessage(e, "Could not update the cash balance");
    }
};
</script>

<template>
    <Dialog
        :visible="visible"
        header="Update cash balance"
        class="dialog-compact max-w-[95vw]"
        :style="{ width: '26rem' }"
        modal
        :draggable="false"
        @update:visible="emit('update:visible', $event)"
    >
        <form
            class="flex flex-col gap-3"
            @submit.prevent="submit"
        >
            <Message
                v-if="errorMessage"
                severity="error"
                :closable="false"
                >{{ errorMessage }}</Message
            >
            <label
                for="cash-balance-amount"
                class="font-medium"
                >Cash in hand</label
            >
            <InputNumber
                v-model="amount"
                input-id="cash-balance-amount"
                mode="decimal"
                locale="en-US"
                :min-fraction-digits="2"
                :max-fraction-digits="2"
                :min="0"
                :suffix="currencySymbol ? ` ${currencySymbol}` : undefined"
                :autofocus="isDesktop"
                fluid
            />
            <small class="text-muted-color">
                We'll record the difference: untracked cash spending if you have less, a cash adjustment if you have
                more.
            </small>
        </form>
        <template #footer>
            <Button
                label="Cancel"
                severity="secondary"
                text
                @click="close"
            />
            <Button
                label="Update"
                icon="pi pi-check"
                :loading="mutation.isPending.value"
                :disabled="!canSubmit"
                @click="submit"
            />
        </template>
    </Dialog>
</template>
