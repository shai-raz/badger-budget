<script setup lang="ts">
/**
 * A small focusable icon that shows a tooltip on hover or focus: the lock beside a field the bank sets,
 * or the ⓘ beside a section title. Focus opens the tooltip, so tapping it on touch works too.
 */
interface Props {
    /** Tooltip text, shown on hover and focus. */
    tooltip: string;
    /** PrimeIcon class suffix, e.g. "pi-lock". */
    icon: string;
    /** Accessible name, e.g. "Locked: from your bank". Pass it as `aria-label`. */
    ariaLabel?: string;
}

defineProps<Props>();
</script>

<template>
    <button
        v-tooltip.top.focus="tooltip"
        type="button"
        class="inline-flex items-center rounded-full text-surface-500 dark:text-surface-400"
        :aria-label="ariaLabel"
        @mouseenter="($event.currentTarget as HTMLElement).focus()"
        @mouseleave="($event.currentTarget as HTMLElement).blur()"
        @click="($event.currentTarget as HTMLElement).focus()"
    >
        <i
            class="pi"
            :class="icon"
            aria-hidden="true"
        ></i>
    </button>
</template>
