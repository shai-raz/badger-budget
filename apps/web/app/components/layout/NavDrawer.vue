<script setup lang="ts">
import { DRAWER_ITEMS, NAV_ACTIVE_LINK_CLASS, NAV_LINK_CLASS, isActiveRoute } from "../../utils/navigation";

// Mobile-only menu, opened by LayoutPageHeader's hamburger. Holds the items the bottom bar
// doesn't: Categories, Settings and logout in the list, the theme switch in the footer. Desktop has
// the sidebar, so the drawer never shows there.
const { open, closeDrawer } = useNavDrawer();
const isDesktop = useIsDesktop();
const route = useRoute();
const themeStore = useThemeStore();
const authStore = useAuthStore();
const logout = useLogout();
const user = computed(() => authStore.user);
const themeSwitchId = useId();

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
            <div class="flex min-w-0 items-center gap-3">
                <Avatar
                    icon="pi pi-user"
                    shape="circle"
                    class="shrink-0"
                />
                <div class="min-w-0">
                    <p class="truncate font-semibold">{{ user?.firstName }} {{ user?.lastName }}</p>
                    <p class="truncate text-sm text-muted-color">{{ user?.email }}</p>
                </div>
            </div>
        </template>

        <nav
            aria-label="Menu"
            class="flex flex-col py-1"
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
            <button
                v-ripple
                type="button"
                :class="[NAV_LINK_CLASS, 'w-[calc(100%-0.5rem)] border-0 bg-transparent text-left']"
                @click="logout(closeDrawer)"
            >
                <span class="pi pi-sign-out" />
                <span>Logout</span>
            </button>
        </nav>

        <template #footer>
            <div
                class="flex items-center justify-between gap-3 border-t border-surface-200 pt-3 pb-[env(safe-area-inset-bottom)] dark:border-surface-700"
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
        </template>
    </Drawer>
</template>
