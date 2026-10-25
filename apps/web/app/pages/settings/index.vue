<script setup lang="ts">
definePageMeta({
    layout: "app",
    fullBleed: true,
});

const authStore = useAuthStore();
const logout = useLogout();

const user = computed(() => authStore.user);
</script>

<template>
    <div class="flex flex-col gap-3 pb-8 md:gap-6">
        <LayoutPageHeader title="Settings" />

        <SharedSectionBand title="Profile">
            <div class="flex flex-col px-4 pb-4 md:px-0 md:pb-0">
                <SharedDetailRow label="Name">{{ user?.firstName }} {{ user?.lastName }}</SharedDetailRow>
                <SharedDetailRow label="Email">{{ user?.email }}</SharedDetailRow>
            </div>
        </SharedSectionBand>

        <SharedSectionBand title="Manage">
            <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
                <NuxtLink
                    to="/categories"
                    class="flex items-center gap-3 px-4 py-3 md:px-0"
                >
                    <i
                        class="pi pi-tags text-muted-color"
                        aria-hidden="true"
                    />
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="text-sm font-semibold">Categories</span>
                        <span class="text-xs text-muted-color">Custom categories and system categories.</span>
                    </span>
                    <i
                        class="pi pi-chevron-right text-surface-400"
                        aria-hidden="true"
                    />
                </NuxtLink>
                <NuxtLink
                    to="/settings/card-payoff-patterns"
                    class="flex items-center gap-3 px-4 py-3 md:px-0"
                >
                    <i
                        class="pi pi-credit-card text-muted-color"
                        aria-hidden="true"
                    />
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="text-sm font-semibold">Card payoff patterns</span>
                        <span class="text-xs text-muted-color">Descriptions of transfers between your accounts.</span>
                    </span>
                    <i
                        class="pi pi-chevron-right text-surface-400"
                        aria-hidden="true"
                    />
                </NuxtLink>
            </div>
        </SharedSectionBand>

        <BankSyncPasskeysCard />

        <SettingsMcpConnectionsCard />

        <SettingsAboutCard />

        <SharedSectionBand title="Account">
            <div class="flex px-4 pb-4 md:px-0 md:pb-0">
                <Button
                    label="Log out"
                    icon="pi pi-sign-out"
                    severity="danger"
                    text
                    @click="logout()"
                />
            </div>
        </SharedSectionBand>
    </div>
</template>
