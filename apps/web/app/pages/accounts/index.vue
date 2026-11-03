<script setup lang="ts">
import type { IAccountResponse } from "@badger/types";
import { isLedgerAccountType } from "@badger/shared-data";
import { sortAccountsForDisplay } from "~/utils/accountBalance";

// fullBleed: below md the band runs edge to edge, as on Overview (see layouts/app.vue).
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const isDesktop = useIsDesktop();

const { data: accounts, isLoading, error } = useGetAccounts();

const rows = computed(() => sortAccountsForDisplay(accounts.value ?? []));

const showFormModal = ref(false);
const editingAccount = ref<IAccountResponse | null>(null);

const showUpdateBalance = ref(false);
const balanceAccount = ref<IAccountResponse | null>(null);
const openUpdateBalance = (account: IAccountResponse) => {
    balanceAccount.value = account;
    showUpdateBalance.value = true;
};

const handleAddAccount = () => {
    editingAccount.value = null;
    showFormModal.value = true;
};

const handleEditAccount = (account: IAccountResponse) => {
    editingAccount.value = account;
    showFormModal.value = true;
};

const showDeleteDialog = ref(false);
const deletingAccount = ref<IAccountResponse | null>(null);
const handleDeleteAccount = (account: IAccountResponse) => {
    deletingAccount.value = account;
    showDeleteDialog.value = true;
};

const handleFormClose = () => {
    showFormModal.value = false;
    editingAccount.value = null;
};

// The ⋮ menu is shared by every row and tile: it is pointed at one account when opened.
const menu = ref();
const selectedAccount = ref<IAccountResponse | null>(null);

const menuItems = computed(() => {
    const account = selectedAccount.value;
    if (!account) return [];
    // An account with linked transfers can't be deleted until those transfers are reverted or re-pointed.
    const deleteBlocked = isLedgerAccountType(account.type) && account.hasLinkedTransfers;
    return [
        {
            label: "Edit",
            icon: "pi pi-pencil",
            command: () => handleEditAccount(account),
        },
        ...(isLedgerAccountType(account.type)
            ? [
                  {
                      label: "Update balance",
                      icon: "pi pi-wallet",
                      command: () => openUpdateBalance(account),
                  },
              ]
            : []),
        {
            label: "Delete",
            icon: "pi pi-trash",
            class: "text-rose-500",
            command: () => handleDeleteAccount(account),
            disabled: deleteBlocked,
            ...(deleteBlocked
                ? {
                      tooltip: "This account has linked transfers. Revert or re-point them before deleting it.",
                  }
                : {}),
        },
    ];
});

const openMenu = ({ account, event }: { account: IAccountResponse; event: Event }) => {
    selectedAccount.value = account;
    menu.value?.toggle(event);
};
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader title="Accounts">
            <template #actions>
                <LayoutHeaderButton
                    label="New"
                    icon="pi pi-plus"
                    primary
                    aria-label="New account"
                    @click="handleAddAccount"
                />
            </template>
        </LayoutPageHeader>

        <SharedSectionBand
            title="Accounts"
            :card="false"
            :meta="`${rows.length}`"
            :loading="isLoading"
            :error="error"
            :empty="!rows.length"
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
                    icon="pi-credit-card"
                    text="Add your first account to start tracking your finances"
                    action-label="Add an account"
                    @action="handleAddAccount"
                />
            </template>

            <div
                v-if="isDesktop"
                class="grid grid-cols-2 gap-4 xl:grid-cols-4"
            >
                <DashboardAccountTile
                    v-for="account in rows"
                    :key="account.id"
                    :account="account"
                    manageable
                    @menu-toggle="openMenu"
                />
            </div>
            <div
                v-else
                class="divide-y divide-surface-200 dark:divide-surface-700"
            >
                <AccountsAccountRow
                    v-for="account in rows"
                    :key="account.id"
                    :account="account"
                    manageable
                    @menu-toggle="openMenu"
                />
            </div>
        </SharedSectionBand>

        <Menu
            ref="menu"
            :model="menuItems"
            popup
        >
            <template #item="{ item, props }">
                <span
                    v-if="item.tooltip"
                    v-tooltip.left="item.tooltip"
                    class="pointer-events-auto block"
                >
                    <a v-bind="props.action">
                        <span
                            v-if="item.icon"
                            :class="item.icon"
                        />
                        <span :class="props.label">{{ item.label }}</span>
                    </a>
                </span>
                <a
                    v-else
                    v-bind="props.action"
                >
                    <span
                        v-if="item.icon"
                        :class="item.icon"
                    />
                    <span :class="props.label">{{ item.label }}</span>
                </a>
            </template>
        </Menu>

        <AccountsDeleteAccountDialog
            v-model:visible="showDeleteDialog"
            :account="deletingAccount"
        />

        <AccountsUpdateLedgerBalanceDialog
            v-model:visible="showUpdateBalance"
            :account="balanceAccount"
        />

        <AccountsFormModal
            v-model:visible="showFormModal"
            :account="editingAccount"
            @close="handleFormClose"
        />
    </div>
</template>
