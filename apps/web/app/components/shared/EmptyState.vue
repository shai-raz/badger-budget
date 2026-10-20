<script setup lang="ts">
/**
 * The only empty-state look in the app: centred icon, optional bold title, text,
 * and an optional action (a link when `actionTo` is set, otherwise a button that
 * emits `action`). Used by SharedSectionBand's default empty slot and by pages
 * that render their own empty state.
 */
interface Props {
    /** PrimeIcon class suffix, e.g. "pi-inbox". */
    icon?: string;
    title?: string;
    text?: string;
    actionLabel?: string;
    /** Route for the action link. When unset, the action renders as a button. */
    actionTo?: string;
}

withDefaults(defineProps<Props>(), {
    icon: "pi-inbox",
    title: undefined,
    text: undefined,
    actionLabel: undefined,
    actionTo: undefined,
});

const emit = defineEmits<{ action: [] }>();
</script>

<template>
    <div class="flex flex-col items-center gap-1 px-4 py-6 text-center">
        <i
            class="pi text-3xl text-surface-400"
            :class="icon"
        ></i>
        <p
            v-if="title"
            class="text-sm font-semibold"
        >
            {{ title }}
        </p>
        <p
            v-if="text"
            class="text-sm text-surface-500 dark:text-surface-400"
        >
            {{ text }}
        </p>
        <NuxtLink
            v-if="actionLabel && actionTo"
            :to="actionTo"
            class="text-sm text-primary hover:underline"
        >
            {{ actionLabel }}
        </NuxtLink>
        <button
            v-else-if="actionLabel"
            type="button"
            class="text-sm text-primary hover:underline"
            @click="emit('action')"
        >
            {{ actionLabel }}
        </button>
    </div>
</template>
