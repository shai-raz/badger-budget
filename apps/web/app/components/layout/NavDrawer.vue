<script setup lang="ts">
import { DRAWER_ITEMS, NAV_ACTIONS, NAV_ACTIVE_LINK_CLASS, isActiveRoute } from "../../utils/navigation";

// Mobile-only menu, opened by LayoutPageHeader's hamburger. The logo heads it, the list holds the items the
// bottom bar doesn't (Categories, Settings). The footer holds the update item that opens UpdateDialog while a
// release is pending, always "What's new" (WhatsNewDialog), then the theme switch and the signed-in user with
// logout, mirroring the sidebar's bottom. Desktop has the sidebar, so the drawer never shows there.
const { open, closeDrawer } = useNavDrawer();
const isDesktop = useIsDesktop();
const route = useRoute();
const themeStore = useThemeStore();
const authStore = useAuthStore();
const logout = useLogout();
const user = computed(() => authStore.user);
const themeSwitchId = useId();

// Bleeds into the drawer's 1.25rem side padding, so every row's text lines up with "Dark mode" while the tap
// highlight still spans the drawer's width.
const DRAWER_ROW_CLASS =
    "-mx-5 flex w-[calc(100%+2.5rem)] items-center gap-2 border-0 bg-transparent px-5 py-2 text-left text-surface-700 transition-colors duration-150 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-800 cursor-pointer";
const { item: updateItem, activate: activateUpdate } = useUpdateNavItem();
const { openRecent } = useWhatsNewDialog();

const openUpdate = () => {
    closeDrawer();
    activateUpdate();
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
                :class="[DRAWER_ROW_CLASS, isActiveRoute(route.path, item.to) && NAV_ACTIVE_LINK_CLASS]"
                @click="closeDrawer"
            >
                <span :class="item.icon" />
                <span>{{ item.label }}</span>
            </NuxtLink>
        </nav>

        <template #footer>
            <div class="flex flex-col pb-[env(safe-area-inset-bottom)]">
                <!-- Directly above the divider, aligned with the footer rows rather than the nav links. -->
                <div class="pb-1">
                    <button
                        v-if="updateItem.show"
                        v-ripple
                        type="button"
                        :class="DRAWER_ROW_CLASS"
                        @click="openUpdate"
                    >
                        <span
                            :class="[
                                updateItem.icon,
                                updateItem.tone === 'warn' ? 'text-amber-600 dark:text-amber-500' : 'text-primary',
                            ]"
                            aria-hidden="true"
                        />
                        <span>{{ updateItem.label }}</span>
                    </button>
                    <button
                        v-ripple
                        type="button"
                        :class="DRAWER_ROW_CLASS"
                        @click="openWhatsNew"
                    >
                        <span
                            :class="NAV_ACTIONS.whatsNew.icon"
                            aria-hidden="true"
                        />
                        <span>{{ NAV_ACTIONS.whatsNew.label }}</span>
                    </button>
                </div>
                <div
                    class="flex items-center justify-between gap-3 border-t border-surface-200 py-3 dark:border-surface-700"
                >
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
