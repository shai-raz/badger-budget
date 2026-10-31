<script setup lang="ts">
/**
 * Shown over an attachment drop target while files are dragged over it. `accept` invites the drop; `refuse` says why it
 * can't take files. It never blocks the pointer: the drop still lands on the target underneath.
 */
defineProps<{
    tone: "accept" | "refuse";
    title: string;
    note: string;
}>();
</script>

<template>
    <div
        class="pointer-events-none absolute -inset-1.5 z-10 flex flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed px-6 text-center"
        :class="
            tone === 'accept'
                ? 'border-primary bg-surface-0/90 dark:bg-surface-900/90'
                : 'border-surface-300 bg-surface-50/95 dark:border-surface-600 dark:bg-surface-900/95'
        "
        aria-hidden="true"
    >
        <span
            :class="tone === 'accept' ? 'pi pi-upload text-primary' : 'pi pi-ban text-muted-color'"
            class="text-xl"
        />
        <span
            class="text-sm font-semibold"
            :class="
                tone === 'accept' ? 'text-surface-900 dark:text-surface-0' : 'text-surface-600 dark:text-surface-300'
            "
        >
            {{ title }}
        </span>
        <span class="text-xs text-muted-color">{{ note }}</span>
    </div>
</template>
