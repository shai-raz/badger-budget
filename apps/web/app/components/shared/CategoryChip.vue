<script setup lang="ts">
/**
 * The one category pill: a coloured dot and the category name on a surface chip.
 * A missing or unparseable `color` falls back to the uncategorized colour, so the
 * chip never renders a broken dot. Callers add their own visibility classes
 * (e.g. `md:hidden`) through `class`.
 */
import { UNCATEGORIZED_CATEGORY } from "@badger/shared-data";
import { normalizeHex } from "~/utils/color";

interface Props {
    name: string;
    color?: string | null;
}

const props = defineProps<Props>();

const backgroundColor = computed(() => normalizeHex(props.color) ?? UNCATEGORIZED_CATEGORY.color);
</script>

<template>
    <span
        class="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full bg-surface-100 px-2 py-0.5 text-[11px] md:px-2.5 md:py-1 md:text-xs dark:bg-surface-800"
    >
        <span
            class="h-1.5 w-1.5 shrink-0 rounded-full md:h-2 md:w-2"
            :style="{ backgroundColor }"
        ></span>
        <span class="truncate">{{ name }}</span>
    </span>
</template>
