<script setup lang="ts">
import type { MenuItem } from "primevue/menuitem";
import { resolveHeaderLeading } from "../../utils/pageHeader";

/**
 * Page header for every app-layout page. It renders into #page-top-bar, full width above the scroller.
 *
 * Rules:
 * - Leading: a child page (`backTo` set) shows back at every breakpoint. A top-level page shows the
 *   hamburger (opens NavDrawer) below md and nothing on desktop, where the sidebar is always visible.
 * - At most two actions visible. Everything else goes in `overflowItems` behind the ellipsis menu.
 * - Build labelled actions with LayoutHeaderButton so they adapt to mobile.
 * - No size props. The actions wrapper sets the button height and width.
 * - The `toolbar` slot renders once: inline on desktop, or on its own row under the title on mobile.
 */

interface Props {
    title: string;
    /** Route for the back button. Set it only on child pages. */
    backTo?: string;
    overflowItems?: MenuItem[];
    overflowLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
    backTo: undefined,
    overflowItems: undefined,
    overflowLabel: "More actions",
});

const router = useRouter();
const isDesktop = useIsDesktop();
const { openDrawer } = useNavDrawer();
const leading = computed(() => resolveHeaderLeading({ hasParent: !!props.backTo, isDesktop: isDesktop.value }));

const goBack = () => {
    if (props.backTo) router.push(props.backTo);
};

const menu = ref<{ toggle: (event: Event) => void } | null>(null);
</script>

<template>
    <Teleport
        defer
        to="#page-top-bar"
    >
        <header class="border-b border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900">
            <div class="flex min-h-14 items-center gap-2 px-4 py-2">
                <Button
                    v-if="leading === 'back'"
                    icon="pi pi-arrow-left"
                    text
                    rounded
                    severity="secondary"
                    aria-label="Back"
                    class="-ml-2 shrink-0"
                    @click="goBack"
                />
                <Button
                    v-else-if="leading === 'menu'"
                    icon="pi pi-bars"
                    text
                    rounded
                    severity="secondary"
                    aria-label="Open menu"
                    class="-ml-2 shrink-0"
                    @click="openDrawer"
                />

                <h1 class="min-w-0 flex-1 truncate text-xl font-semibold">{{ title }}</h1>

                <div
                    v-if="isDesktop && $slots.toolbar"
                    class="flex min-w-0 items-center"
                >
                    <slot name="toolbar" />
                </div>

                <div
                    v-if="$slots.actions || overflowItems?.length"
                    class="flex shrink-0 items-center gap-2 [&_.p-button]:h-10 [&_.p-button-icon-only]:w-10"
                >
                    <slot name="actions" />
                    <Button
                        v-if="overflowItems?.length"
                        icon="pi pi-ellipsis-v"
                        text
                        rounded
                        severity="secondary"
                        :aria-label="overflowLabel"
                        aria-haspopup="true"
                        @click="menu?.toggle($event)"
                    />
                </div>
            </div>

            <div
                v-if="!isDesktop && $slots.toolbar"
                class="px-4 pb-3"
            >
                <slot name="toolbar" />
            </div>
        </header>
    </Teleport>

    <Menu
        ref="menu"
        :model="overflowItems"
        popup
    >
        <template #item="{ item, props: itemProps }">
            <span
                v-if="item.tooltip"
                v-tooltip.left="item.tooltip"
                class="pointer-events-auto block"
            >
                <a v-bind="itemProps.action">
                    <span
                        v-if="item.icon"
                        :class="item.icon"
                    />
                    <span :class="itemProps.label">{{ item.label }}</span>
                </a>
            </span>
            <a
                v-else
                v-bind="itemProps.action"
            >
                <span
                    v-if="item.icon"
                    :class="item.icon"
                />
                <span :class="itemProps.label">{{ item.label }}</span>
            </a>
        </template>
    </Menu>
</template>
