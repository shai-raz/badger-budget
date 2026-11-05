<script setup lang="ts">
/**
 * The avatar drawn beside a filter option: an entity's icon and colour for categories and accounts, or the arrow glyph
 * for a transaction type.
 */
import type { FilterOptionAvatar } from "~/utils/filterOptions";
import type { AvatarSize } from "~/utils/avatarIcons";

interface Props {
    avatar: FilterOptionAvatar;
    size?: AvatarSize;
}

withDefaults(defineProps<Props>(), {
    size: "xs",
});
</script>

<template>
    <TransactionsTypeAvatar
        v-if="avatar.kind === 'type'"
        :type="avatar.type"
        :size="size"
    />
    <SharedEntityAvatar
        v-else
        :icon="avatar.icon"
        :color="avatar.color"
        :fallback="avatar.fallback"
        :size="size"
    />
</template>
