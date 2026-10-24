<script setup lang="ts">
import {
    DRAWER_ITEMS,
    NAV_ACTIONS,
    NAV_ACTIVE_LINK_CLASS,
    NAV_LINK_CLASS,
    isActiveRoute,
} from "../../utils/navigation";

// Mobile-only menu, opened by LayoutPageHeader's hamburger. The logo heads it, the list holds the items the
// bottom bar doesn't (Categories, Settings), the update item that opens UpdateDialog while a release is pending,
// and always "What's new" (WhatsNewDialog). The footer holds the theme switch and the signed-in user with
// logout, mirroring the sidebar's bottom. Desktop has the sidebar, so the drawer never shows there.
const { open, closeDrawer } = useNavDrawer();
const isDesktop = useIsDesktop();
const route = useRoute();
const themeStore = useThemeStore();
const authStore = useAuthStore();
const logout = useLogout();
const user = computed(() => authStore.user);
const themeSwitchId = useId();
const { visible: updateVisible } = useUpdateNotice();
const { openDialog } = useUpdateDialog();
const { openRecent } = useWhatsNewDialog();

const openUpdateDialog = () => {
    closeDrawer();
    openDialog();
};

const openWhatsNew = () => {
    closeDrawer();
    openRecent();
};

// Any navigation (including tapping the current page's link) closes the drawer.
watch(() => route.fullPath, closeDrawer);
watch(isDesktop, (desktop) => {
    if (desktop) closeDrawer();
});
</script>

<template>
    <Drawer
        v-if="!isDesktop"
        v-model:visible="open"
        position="left"
        class="w-72 max-w-[85vw]"
    >
        <template #header>
            <NuxtLink
                to="/"
                aria-label="Badger, go to Overview"
                class="flex"
                @click="closeDrawer"
            >
                <SharedBrandLogo class="h-9" />
            </NuxtLink>
        </template>

        <nav
            aria-label="Menu"
            class="flex h-full flex-col py-1"
        >
            <NuxtLink
                v-for="item in DRAWER_ITEMS"
                :key="item.to"
                v-ripple
                :to="item.to"
                :class="[NAV_LINK_CLASS, isActiveRoute(route.path, item.to) && NAV_ACTIVE_LINK_CLASS]"
                @click="closeDrawer"
            >
                <span :class="item.icon" />
                <span>{{ item.label }}</span>
            </NuxtLink>
            <!-- Pinned to the bottom of the list, directly above the footer's divider, as in the sidebar. -->
            <div class="mt-auto">
                <button
                    v-if="updateVisible"
                    v-ripple
                    type="button"
                    :class="[NAV_LINK_CLASS, 'w-[calc(100%-0.5rem)] border-0 bg-transparent text-left']"
                    @click="openUpdateDialog"
                >
                    <span
                        :class="[NAV_ACTIONS.update.icon, 'text-primary']"
                        aria-hidden="true"
                    />
                    <span>{{ NAV_ACTIONS.update.label }}</span>
                </button>
                <button
                    v-ripple
                    type="button"
                    :class="[NAV_LINK_CLASS, 'w-[calc(100%-0.5rem)] border-0 bg-transparent text-left']"
                    @click="openWhatsNew"
                >
                    <span
                        :class="NAV_ACTIONS.whatsNew.icon"
                        aria-hidden="true"
                    />
                    <span>{{ NAV_ACTIONS.whatsNew.label }}</span>
                </button>
            </div>
        </nav>

        <template #footer>
            <div
                class="flex flex-col border-t border-surface-200 pb-[env(safe-area-inset-bottom)] dark:border-surface-700"
            >
                <div class="flex items-center justify-between gap-3 py-3">
                    <label
                        :for="themeSwitchId"
                        class="text-surface-700 dark:text-surface-200"
                    >
                        Dark mode
                    </label>
                    <ToggleSwitch
                        :input-id="themeSwitchId"
                        :model-value="themeStore.isDark"
                        @update:model-value="(value) => themeStore.setTheme(value === true)"
                    >
                        <template #handle="{ checked }">
                            <i
                                :class="['pi', checked ? 'pi-moon' : 'pi-sun', 'text-[0.625rem]']"
                                aria-hidden="true"
                            />
                        </template>
                    </ToggleSwitch>
                </div>
                <div class="flex min-w-0 items-center gap-3 border-t border-surface-200 pt-3 dark:border-surface-700">
                    <Avatar
                        icon="pi pi-user"
                        shape="circle"
                        class="shrink-0"
                    />
                    <div class="min-w-0 flex-1">
                        <p class="truncate font-semibold">{{ user?.firstName }} {{ user?.lastName }}</p>
                        <p class="truncate text-sm text-muted-color">{{ user?.email }}</p>
                    </div>
                    <Button
                        icon="pi pi-sign-out"
                        severity="secondary"
                        text
                        rounded
                        aria-label="Logout"
                        class="shrink-0"
                        @click="logout(closeDrawer)"
                    />
                </div>
            </div>
        </template>
    </Drawer>
</template>
