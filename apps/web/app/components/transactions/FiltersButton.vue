<script setup lang="ts">
import { computed } from "vue";

/**
 * The Filters button that opens the drawer or sheet of drawer filters. Always an icon-only 36px square. While a drawer
 * filter is active, the count shows as a circular info badge on its top-right corner (OverlayBadge, decorative); the
 * aria-label carries the count.
 */
const props = defineProps<{
    /** Active drawer filters (types, accounts, categories, hidden); the period is not counted. */
    count: number;
    /** Whether the drawer or sheet it opens is open. */
    expanded: boolean;
}>();

const emit = defineEmits<{ (event: "click"): void }>();

const buttonProps = computed(() => ({
    icon: "pi pi-sliders-h",
    size: "small" as const,
    severity: "secondary" as const,
    outlined: true,
    class: "h-9 w-9 shrink-0",
    "aria-label": props.count > 0 ? `Filters, ${props.count} active` : "Filters",
    "aria-haspopup": "dialog" as const,
    "aria-expanded": props.expanded,
}));
</script>

<template>
    <OverlayBadge
        v-if="count > 0"
        :value="count"
        severity="info"
        size="small"
        class="flex shrink-0"
        :pt="{ pcBadge: { root: { class: 'rounded-full px-1', 'aria-hidden': 'true' } } }"
    >
        <Button
            v-bind="buttonProps"
            @click="emit('click')"
        />
    </OverlayBadge>
    <Button
        v-else
        v-bind="buttonProps"
        @click="emit('click')"
    />
</template>
