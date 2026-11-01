<script setup lang="ts">
import {
    NAV_ACTIONS,
    NAV_ACTIVE_LINK_CLASS,
    NAV_LINK_CLASS,
    SIDEBAR_BOTTOM_ITEMS,
    SIDEBAR_ITEMS,
    isActiveRoute,
} from "../../utils/navigation";

const route = useRoute();
const logout = useLogout();

const themeStore = useThemeStore();
const authStore = useAuthStore();
const user = computed(() => authStore.user);

// The update item sits at the bottom of the nav, above the divider, while a release is pending or an upgrade runs.
const { item: updateItem, activate: activateUpdate } = useUpdateNavItem();
const { openRecent } = useWhatsNewDialog();
</script>

<template>
    <div
        class="flex flex-col h-full w-52 border-r border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900"
    >
        <div class="flex items-center justify-between px-3 py-2 border-surface-200 dark:border-surface-700">
            <NuxtLink
                to="/"
                aria-label="Badger, go to Overview"
                class="flex"
            >
                <SharedBrandLogo class="h-9" />
            </NuxtLink>
            <Button
                :icon="themeStore.isDark ? 'pi pi-sun' : 'pi pi-moon'"
                severity="secondary"
                text
                rounded
                :aria-label="`Switch to ${themeStore.isDark ? 'light' : 'dark'} mode`"
                @click="themeStore.toggleDarkMode()"
            />
        </div>

        <nav class="flex flex-col flex-1 py-1 overflow-y-auto">
            <NuxtLink
                v-for="item in SIDEBAR_ITEMS"
                :key="item.to"
                v-ripple
                :to="item.to"
                :class="[NAV_LINK_CLASS, isActiveRoute(route.path, item.to) && NAV_ACTIVE_LINK_CLASS]"
            >
                <span :class="item.icon" />
                <span>{{ item.label }}</span>
            </NuxtLink>
            <div class="mt-auto">
                <button
                    v-if="updateItem.show"
                    v-ripple
                    type="button"
                    :class="[NAV_LINK_CLASS, 'w-[calc(100%-0.5rem)] border-0 bg-transparent text-left']"
                    @click="activateUpdate"
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
                    :class="[NAV_LINK_CLASS, 'w-[calc(100%-0.5rem)] border-0 bg-transparent text-left']"
                    @click="openRecent()"
                >
                    <span
                        :class="NAV_ACTIONS.whatsNew.icon"
                        aria-hidden="true"
                    />
                    <span>{{ NAV_ACTIONS.whatsNew.label }}</span>
                </button>
            </div>
        </nav>

        <div class="border-t border-surface-200 dark:border-surface-700">
            <NuxtLink
                v-for="item in SIDEBAR_BOTTOM_ITEMS"
                :key="item.to"
                v-ripple
                :to="item.to"
                :class="[NAV_LINK_CLASS, isActiveRoute(route.path, item.to) && NAV_ACTIVE_LINK_CLASS]"
            >
                <span :class="item.icon" />
                <span>{{ item.label }}</span>
            </NuxtLink>
            <button
                v-ripple
                type="button"
                :class="[NAV_LINK_CLASS, 'w-[calc(100%-0.5rem)] border-0 bg-transparent text-left']"
                @click="logout()"
            >
                <span class="pi pi-sign-out" />
                <span>Logout</span>
            </button>
            <button
                v-ripple
                class="relative overflow-hidden w-full border-0 bg-transparent flex items-center gap-2 px-3 py-2 hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer transition-colors duration-150"
            >
                <Avatar
                    icon="pi pi-user"
                    shape="circle"
                    class="shrink-0"
                />
                <span class="font-bold text-sm truncate">{{ user?.firstName }} {{ user?.lastName }}</span>
            </button>
        </div>
    </div>
</template>
