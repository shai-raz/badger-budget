<script setup lang="ts">
import { computed } from "vue";
import type { ITransactionResponse } from "@badger/types";
import { useMarkCardPayoff } from "../../composables/transactions/useMarkCardPayoff";
import { useCardPayoffLinkPreview } from "../../composables/card-payoff-patterns/useCardPayoffPatterns";
import { linkRemovalWarning } from "../../utils/reimbursement";

interface Props {
    visible: boolean;
    transaction: ITransactionResponse | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    "update:visible": [value: boolean];
    success: [];
}>();

const { mutate: markAsCardPayoff, isPending } = useMarkCardPayoff();

// Previews the links this re-tag would delete, for the description that will be submitted.
const { data: linkPreview } = useCardPayoffLinkPreview(
    computed(() => props.transaction?.description ?? null),
    computed(() => props.visible),
);
const removalWarning = computed(() => linkRemovalWarning(linkPreview.value));

const handleConfirm = () => {
    if (!props.transaction) return;

    markAsCardPayoff(
        {
            id: props.transaction.id,
            description: props.transaction.description,
        },
        {
            onSuccess: () => {
                emit("update:visible", false);
                emit("success");
            },
        },
    );
};

const handleCancel = () => {
    emit("update:visible", false);
};
</script>

<template>
    <Dialog
        :visible="visible"
        class="dialog-compact max-w-[95vw]"
        modal
        header="Mark as credit card payment"
        :style="{ width: '35rem' }"
        :closable="!isPending"
        :close-on-escape="!isPending"
        @update:visible="emit('update:visible', $event)"
    >
        <div class="flex flex-col gap-3">
            <div class="flex items-start gap-2">
                <i
                    class="pi pi-exclamation-triangle text-orange-500"
                    style="font-size: 1.5rem"
                ></i>
                <div class="flex-1">
                    <p class="m-0 mb-2">
                        The following description will be marked as a credit card payment for all your transactions:
                    </p>
                    <div class="p-3 bg-surface-100 dark:bg-surface-800 rounded-md">
                        <Tag
                            :value="transaction?.description"
                            severity="info"
                            class="w-full"
                            style="justify-content: center"
                        />
                    </div>
                    <p class="text-sm text-surface-500 dark:text-surface-400 mt-2 mb-0">
                        This will affect {{ transaction ? "all transactions" : "your transactions" }} with this exact
                        description. They will be marked as transfers, hidden from your transaction list, and excluded
                        from income and expense totals.
                    </p>
                </div>
            </div>
            <Message
                v-if="removalWarning"
                severity="warn"
                :closable="false"
                >{{ removalWarning }}</Message
            >
        </div>

        <template #footer>
            <Button
                label="Cancel"
                text
                :disabled="isPending"
                @click="handleCancel"
            />
            <Button
                label="Mark as Card Payment"
                severity="warning"
                :loading="isPending"
                autofocus
                @click="handleConfirm"
            />
        </template>
    </Dialog>
</template>
