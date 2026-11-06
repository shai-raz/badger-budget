<script setup lang="ts">
/**
 * The round, tinted avatar for a category or account: a Lucide glyph on a 14%
 * wash of its colour. `icon` is a stored registry name; anything that doesn't
 * resolve (null, unknown, legacy names) renders `fallback` instead, so the
 * avatar never comes out blank. `color` is a hex or a `var(--token)`; a token
 * tints through color-mix and draws the glyph in currentColor, since an SVG
 * presentation attribute cannot resolve var(). `glyph` draws a Lucide component
 * in place of the registry icon, for glyphs that are not stored avatar icons
 * (transaction types). Sizes: `xs` for chips and select rows, `sm` for
 * picker tiles, `md` for lists, `lg` for the transaction detail hero.
 */
import type { Component } from "vue";
import type { AvatarIconName } from "@badger/shared-data";
import { cssVarColor, normalizeHex, hexToRgba } from "~/utils/color";
import { AVATAR_SIZES, resolveAvatarIcon, type AvatarSize } from "~/utils/avatarIcons";

interface Props {
    icon?: string | null;
    color?: string | null;
    fallback: AvatarIconName;
    size?: AvatarSize;
    /** A Lucide component drawn instead of the registry icon, for glyphs that are not stored avatar icons (transaction types). */
    glyph?: Component;
}

const props = withDefaults(defineProps<Props>(), {
    icon: null,
    color: null,
    size: "md",
    glyph: undefined,
});

// Neutral grey, used when `color` doesn't parse.
const DEFAULT_COLOR = "#6B7280";

const tokenColor = computed(() => cssVarColor(props.color));
const resolvedColor = computed(() => tokenColor.value ?? normalizeHex(props.color) ?? DEFAULT_COLOR);
const background = computed(() =>
    tokenColor.value
        ? `color-mix(in srgb, ${tokenColor.value} 14%, transparent)`
        : hexToRgba(resolvedColor.value, 0.14),
);
const rootStyle = computed(() =>
    tokenColor.value
        ? { backgroundColor: background.value, color: tokenColor.value }
        : { backgroundColor: background.value },
);
const glyphColor = computed(() => (tokenColor.value ? "currentColor" : resolvedColor.value));
const iconComponent = computed(() => props.glyph ?? resolveAvatarIcon(props.icon, props.fallback));

const sizing = computed(() => AVATAR_SIZES[props.size]);
</script>

<template>
    <div
        class="flex shrink-0 items-center justify-center rounded-full"
        :class="sizing.box"
        :style="rootStyle"
    >
        <component
            :is="iconComponent"
            :size="sizing.icon"
            :color="glyphColor"
            :stroke-width="2"
            aria-hidden="true"
        />
    </div>
</template>
