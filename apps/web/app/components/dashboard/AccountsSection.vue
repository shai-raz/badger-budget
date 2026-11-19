<script setup lang="ts">
import type { IAccountResponse } from "@badger/types";
import { useGetAccounts } from "~/composables/accounts/useAccounts";
import { balanceAccounts, sumBankBalances } from "~/utils/accountBalance";
import { formatCurrency } from "~/utils/currency";

const isDesktop = useIsDesktop();

const { data, isLoading, error } = useGetAccounts();

const accounts = computed(() => balanceAccounts(data.value ?? []));
// Bank total: mobile-only header meta (desktop shows nothing here — each
// balance-bearing tile already carries its own amount). Includes hidden accounts.
const bankTotal = computed(() => sumBankBalances(accounts.value));

const shownAccounts = computed(() => accounts.value.filter((account) => !account.hiddenOnOverview));
// Every balance-bearing account is hidden: the section would otherwise read as having no balances.
const allHidden = computed(() => accounts.value.length > 0 && shownAccounts.value.length === 0);

const balanceAccount = ref<IAccountResponse | null>(null);
const showUpdateBalance = ref(false);
const openUpdateBalance = (account: IAccountResponse) => {
    balanceAccount.value = account;
    showUpdateBalance.value = true;
};
</script>

<template>
    <SharedSectionBand
        title="Accounts"
        :card="false"
        link-to="/accounts"
        link-label="All accounts"
        :meta="
            isDesktop
                ? undefined
                : bankTotal
                  ? `${formatCurrency(bankTotal.total, bankTotal.currencyCode)} total`
                  : undefined
        "
        :loading="isLoading"
        :error="error"
        :empty="!shownAccounts.length"
    >
        <template #skeleton>
            <div class="grid grid-cols-2 gap-3 px-4 pb-3 md:gap-4 md:px-0 md:pb-0 xl:grid-cols-4">
                <Skeleton
                    v-for="i in 4"
                    :key="i"
                    height="7.5rem"
                />
            </div>
        </template>

        <template #empty>
            <SharedEmptyState
                v-if="allHidden"
                icon="pi-eye-slash"
                text="All accounts are hidden from Overview"
                action-label="Manage accounts"
                action-to="/accounts"
            />
            <SharedEmptyState
                v-else
                text="No account balances yet"
                action-label="Connect a bank"
                action-to="/bank-connections"
            />
        </template>

        <div
            v-if="isDesktop"
            class="grid grid-cols-2 gap-4 xl:grid-cols-4"
        >
            <DashboardAccountTile
                v-for="account in shownAccounts"
                :key="account.id"
                :account="account"
                @update-cash="openUpdateBalance(account)"
            />
        </div>
        <div
            v-else
            class="divide-y divide-surface-200 dark:divide-surface-700"
        >
            <AccountsAccountRow
                v-for="account in shownAccounts"
                :key="account.id"
                :account="account"
                @update-cash="openUpdateBalance(account)"
            />
        </div>

        <AccountsUpdateLedgerBalanceDialog
            v-model:visible="showUpdateBalance"
            :account="balanceAccount"
        />
    </SharedSectionBand>
</template>
