<script setup lang="ts">
import type { MenuItem } from "primevue/menuitem";
import { canGoBackTo, resolveHeaderLeading } from "../../utils/pageHeader";
import { hamburgerLabel } from "../../utils/updateNotice";
import { upgradeBadgeVisible } from "../../utils/upgradeTracking";

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
 * - `controls` is a compact control kept on the title row at every breakpoint (the Reports period picker), unlike
 *   `toolbar`, which drops to its own row below md.
 * - Back returns through history when the user came from `backTo`, which keeps the parent's query (the
 *   range) and scroll. Otherwise it pushes `backTo`, the deep-link case.
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
// Hamburger badge: a pending release or an upgrade in flight, shown only on the menu leading (top-level pages below md).
const { visible: updateVisible } = useUpdateNotice();
const { phase } = useUpgrade();
const badgeShown = computed(() => upgradeBadgeVisible(updateVisible.value, phase.value));
const leading = computed(() => resolveHeaderLeading({ hasParent: !!props.backTo, isDesktop: isDesktop.value }));

const goBack = () => {
    if (!props.backTo) return;
    if (canGoBackTo(window.history.state?.back, props.backTo)) router.back();
    else router.push(props.backTo);
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
                <span
                    v-else-if="leading === 'menu'"
                    class="relative -ml-2 shrink-0"
                >
                    <Button
                        icon="pi pi-bars"
                        text
                        rounded
                        severity="secondary"
                        :aria-label="hamburgerLabel(updateVisible, phase)"
                        @click="openDrawer"
                    />
                    <span
                        v-if="badgeShown"
                        aria-hidden="true"
                        class="pointer-events-none absolute right-1.5 top-1.5 flex h-2.5 w-2.5 items-center justify-center"
                    >
                        <!-- The spinner fills the dot's box, so the header keeps its size while an upgrade runs. -->
                        <i
                            v-if="phase === 'upgrading'"
                            class="pi pi-spin pi-spinner text-[0.625rem] text-primary"
                        />
                        <span
                            v-else
                            :class="[
                                'h-2.5 w-2.5 rounded-full ring-2 ring-surface-0 dark:ring-surface-900',
                                phase === 'stalled' ? 'bg-amber-500' : 'bg-primary',
                            ]"
                        />
                    </span>
                </span>

                <h1 class="min-w-0 flex-1 truncate text-xl font-semibold">{{ title }}</h1>

                <div
                    v-if="isDesktop && $slots.toolbar"
                    class="flex min-w-0 items-center"
                >
                    <slot name="toolbar" />
                </div>

                <div
                    v-if="$slots.controls"
                    class="flex shrink-0 items-center"
                >
                    <slot name="controls" />
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
