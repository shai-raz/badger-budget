<script setup lang="ts">
/**
 * The round, tinted avatar for a transaction type: an arrow glyph on a 14% wash of the type's amount colour. Same
 * markup as `SharedEntityAvatar`, so type and entity options line up in the filter pickers.
 */
import type { TransactionType } from "@badger/shared-data";
import { AVATAR_SIZES, TRANSACTION_TYPE_AVATARS, type AvatarSize } from "~/utils/avatarIcons";

interface Props {
    type: TransactionType;
    size?: AvatarSize;
}

const props = withDefaults(defineProps<Props>(), {
    size: "md",
});

const avatar = computed(() => TRANSACTION_TYPE_AVATARS[props.type]);
const sizing = computed(() => AVATAR_SIZES[props.size]);
</script>

<template>
    <!-- The colour is a var() token, which an SVG presentation attribute cannot resolve, so the glyph takes it
         through currentColor from this element's inline colour. -->
    <div
        class="flex shrink-0 items-center justify-center rounded-full"
        :class="sizing.box"
        :style="{
            backgroundColor: `color-mix(in srgb, ${avatar.color} 14%, transparent)`,
            color: avatar.color,
        }"
    >
        <component
            :is="avatar.icon"
            :size="sizing.icon"
            color="currentColor"
            :stroke-width="2"
            aria-hidden="true"
        />
    </div>
</template>
