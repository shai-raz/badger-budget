<script setup lang="ts">
defineProps<{ tooltip: string }>();
</script>

<template>
    <button
        v-tooltip.top.focus="tooltip"
        type="button"
        class="inline-flex items-center rounded-full text-surface-500 dark:text-surface-400"
        aria-label="Locked: from your bank"
        @mouseenter="($event.currentTarget as HTMLElement).focus()"
        @mouseleave="($event.currentTarget as HTMLElement).blur()"
        @click="($event.currentTarget as HTMLElement).focus()"
    >
        <i
            class="pi pi-lock"
            aria-hidden="true"
        ></i>
    </button>
</template>
