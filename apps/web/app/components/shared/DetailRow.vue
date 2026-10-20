<script setup lang="ts">
interface Props {
    label: string;
    /** Optional pi icon class rendered before the value (e.g. "pi pi-credit-card"). */
    icon?: string;
    /** Optional icon color (categories/accounts carry their own hex colors). */
    iconColor?: string;
}

defineProps<Props>();
</script>

<template>
    <div
        class="flex items-start justify-between gap-4 py-3 border-t border-surface-200 dark:border-surface-700 first:border-t-0"
    >
        <span class="text-sm text-surface-500 dark:text-surface-400 shrink-0 pt-0.5">{{ label }}</span>
        <span class="text-sm font-medium text-right inline-flex items-center justify-end gap-2 min-w-0 flex-wrap">
            <span
                v-if="icon"
                :class="icon"
                class="text-sm"
                :style="iconColor ? { color: iconColor } : undefined"
            />
            <slot />
        </span>
    </div>
</template>
