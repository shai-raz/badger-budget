<script setup lang="ts">
/**
 * The round, tinted avatar for a category or account: a Lucide glyph on a 14%
 * wash of its colour. `icon` is a stored registry name; anything that doesn't
 * resolve (null, unknown, legacy names) renders `fallback` instead, so the
 * avatar never comes out blank. Sizes: `xs` for chips and select rows, `sm` for
 * picker tiles, `md` for lists, `lg` for the transaction detail hero.
 */
import type { AvatarIconName } from "@badger/shared-data";
import { normalizeHex, hexToRgba } from "~/utils/color";
import { AVATAR_SIZES, resolveAvatarIcon, type AvatarSize } from "~/utils/avatarIcons";

interface Props {
    icon?: string | null;
    color?: string | null;
    fallback: AvatarIconName;
    size?: AvatarSize;
}

const props = withDefaults(defineProps<Props>(), {
    icon: null,
    color: null,
    size: "md",
});

// Neutral grey, used when `color` doesn't parse.
const DEFAULT_COLOR = "#6B7280";

const resolvedColor = computed(() => normalizeHex(props.color) ?? DEFAULT_COLOR);
const background = computed(() => hexToRgba(resolvedColor.value, 0.14));
const iconComponent = computed(() => resolveAvatarIcon(props.icon, props.fallback));

const sizing = computed(() => AVATAR_SIZES[props.size]);
</script>

<template>
    <div
        class="flex shrink-0 items-center justify-center rounded-full"
        :class="sizing.box"
        :style="{ backgroundColor: background }"
    >
        <component
            :is="iconComponent"
            :size="sizing.icon"
            :color="resolvedColor"
            :stroke-width="2"
            aria-hidden="true"
        />
    </div>
</template>
