<script setup lang="ts">
import type { ITransactionResponse } from "@badger/types";
import TransactionRow from "../transactions/TransactionRow.vue";

defineProps<{
    transactions: ITransactionResponse[];
}>();

const router = useRouter();
const isDesktop = useIsDesktop();

const handleClick = (transaction: ITransactionResponse) => {
    router.push(`/transactions/${transaction.id}`);
};
</script>

<template>
    <div>
        <TransactionRow
            v-for="transaction in transactions"
            :key="transaction.id"
            :transaction="transaction"
            clickable
            :show-menu="false"
            :sub-line="isDesktop ? 'date-account' : 'date-category'"
            :show-pill="isDesktop"
            @click="handleClick"
        />
    </div>
</template>
