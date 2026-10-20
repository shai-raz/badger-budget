<script setup lang="ts">
import { BOTTOM_BAR_ITEMS, isActiveRoute } from "../../utils/navigation";

const route = useRoute();
</script>

<template>
    <!-- In flow, not fixed: this nav is the second flex child of the layout's
         dynamic-viewport (100dvh) column, so the content area above it gets exactly
         the leftover height and no page needs to reserve bottom padding to clear it.
         It pads env(safe-area-inset-bottom) so its background fills the
         home-indicator/gesture strip. -->
    <nav
        class="border-t border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 pb-[env(safe-area-inset-bottom)]"
        aria-label="Bottom navigation"
    >
        <ul class="grid grid-cols-4">
            <li
                v-for="item in BOTTOM_BAR_ITEMS"
                :key="item.to"
                class="flex"
            >
                <NuxtLink
                    :to="item.to"
                    class="flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors"
                    :class="
                        isActiveRoute(route.path, item.to)
                            ? 'text-primary bg-surface-100 dark:bg-surface-800'
                            : 'text-surface-500 dark:text-surface-300'
                    "
                >
                    <span :class="[item.icon, 'text-xl']" />
                    <span class="text-xs leading-none">{{ item.label }}</span>
                </NuxtLink>
            </li>
        </ul>
    </nav>
</template>
