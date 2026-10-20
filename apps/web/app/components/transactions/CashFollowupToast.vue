<script setup lang="ts">
import { useToast } from "primevue/usetoast";
import type { CashFollowup } from "../../utils/transactionForm";

const GROUP = "cash-followup";

const toast = useToast();

const toastBreakpoints = {
    [BELOW_MD]: { width: "calc(100vw - 2rem)", left: "1rem", right: "1rem" },
};

const recordPayment = (data: CashFollowup) => {
    toast.removeGroup(GROUP);
    void navigateTo({
        path: "/transactions",
        query: {
            create: "expense",
            accountId: data.accountId,
            ...(data.categoryId ? { categoryId: data.categoryId } : {}),
        },
    });
};
</script>

<template>
    <Toast
        :group="GROUP"
        :breakpoints="toastBreakpoints"
    >
        <template #message="{ message }">
            <div class="flex min-w-0 flex-1 items-start gap-2">
                <i
                    class="pi pi-check p-toast-message-icon"
                    aria-hidden="true"
                />
                <div class="flex min-w-0 flex-1 flex-col items-start gap-2">
                    <span class="p-toast-summary">{{ message.summary }}</span>
                    <Button
                        label="Record a cash payment"
                        severity="success"
                        outlined
                        size="small"
                        @click="recordPayment(message.data as CashFollowup)"
                    />
                </div>
            </div>
        </template>
    </Toast>
</template>
