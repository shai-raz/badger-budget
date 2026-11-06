<script setup lang="ts">
/**
 * The avatar drawn beside a filter option: an entity's icon and colour for categories and accounts, or the arrow glyph
 * for a transaction type.
 */
import type { Component } from "vue";
import type { AvatarIconName } from "@badger/shared-data";
import type { FilterOptionAvatar } from "~/utils/filterOptions";
import { TRANSACTION_TYPE_AVATARS, type AvatarSize } from "~/utils/avatarIcons";

interface Props {
    avatar: FilterOptionAvatar;
    size?: AvatarSize;
}

const props = withDefaults(defineProps<Props>(), {
    size: "xs",
});

// A type option's fallback is never drawn: the glyph wins.
const entityProps = computed<{
    glyph?: Component;
    icon?: string | null;
    color: string | null;
    fallback: AvatarIconName;
}>(() => {
    const { avatar } = props;
    if (avatar.kind === "type") {
        const typeAvatar = TRANSACTION_TYPE_AVATARS[avatar.type];
        return { glyph: typeAvatar.icon, color: typeAvatar.color, fallback: "circle-help" };
    }
    return { icon: avatar.icon, color: avatar.color, fallback: avatar.fallback };
});
</script>

<template>
    <SharedEntityAvatar
        v-bind="entityProps"
        :size="size"
    />
</template>
