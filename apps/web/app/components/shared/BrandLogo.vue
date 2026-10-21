<script setup lang="ts">
// The two logo sets only work on their own backdrop: `-light` (gold coin, black badger) on light surfaces,
// `-dark` (its body is negative space) on dark ones. Both are rendered and `.dark` picks one, so the swap
// needs no JS and is right on first paint. Size it with a height class; the width follows.
const props = withDefaults(defineProps<{ variant?: "horizontal" | "stacked" }>(), { variant: "horizontal" });

const src = computed(() => {
    const name = props.variant === "horizontal" ? "logo-horizontal" : "logo";
    return { light: `/brand/${name}-light.svg`, dark: `/brand/${name}-dark.svg` };
});
</script>

<template>
    <span class="inline-flex shrink-0">
        <img
            :src="src.light"
            alt="Badger"
            class="h-full w-auto dark:hidden"
        />
        <img
            :src="src.dark"
            alt="Badger"
            class="hidden h-full w-auto dark:block"
        />
    </span>
</template>
