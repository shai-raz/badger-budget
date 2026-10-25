<script setup lang="ts">
/**
 * The one category pill: a surface chip with the category name. By default it leads with the category's
 * icon, in its colour. `showIcon: false` swaps the icon for a coloured dot, for callers that already show
 * the category avatar beside the chip. A missing or unparseable `color` falls back to the uncategorized
 * colour, and a missing or unknown `icon` to the default category icon, so the chip never renders broken.
 * Callers add their own visibility classes (e.g. `md:hidden`) through `class`.
 */
import { DEFAULT_CATEGORY_AVATAR_ICON, UNCATEGORIZED_CATEGORY } from "@badger/shared-data";
import { normalizeHex } from "~/utils/color";
import { resolveAvatarIcon } from "~/utils/avatarIcons";

interface Props {
    name: string;
    color?: string | null;
    icon?: string | null;
    showIcon?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    color: null,
    icon: null,
    showIcon: true,
});

const backgroundColor = computed(() => normalizeHex(props.color) ?? UNCATEGORIZED_CATEGORY.color);
const iconComponent = computed(() => resolveAvatarIcon(props.icon, DEFAULT_CATEGORY_AVATAR_ICON));
</script>

<template>
    <span
        class="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full bg-surface-100 px-2 py-0.5 text-[11px] md:px-2.5 md:py-1 md:text-xs dark:bg-surface-800"
    >
        <component
            :is="iconComponent"
            v-if="showIcon"
            :size="12"
            :color="backgroundColor"
            :stroke-width="2"
            class="shrink-0 md:h-3.5 md:w-3.5"
            aria-hidden="true"
        />
        <span
            v-else
            class="h-1.5 w-1.5 shrink-0 rounded-full md:h-2 md:w-2"
            :style="{ backgroundColor }"
        ></span>
        <span class="truncate">{{ name }}</span>
    </span>
</template>
