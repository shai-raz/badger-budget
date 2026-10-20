<script setup lang="ts">
/**
 * Action button for LayoutPageHeader. Desktop renders a labelled button (filled when `primary`, outlined
 * otherwise). Mobile always renders the same plain icon-only text button as the header's hamburger and
 * ⋮; `primary` does not change it, so the filled round "+" exists only as the Transactions FAB. Both
 * variants use the same props, so pages declare an action once. No size props: the header's actions
 * wrapper sets the height.
 */
interface Props {
    label: string;
    icon: string;
    primary?: boolean;
    ariaLabel?: string;
    loading?: boolean;
    disabled?: boolean;
}

withDefaults(defineProps<Props>(), {
    primary: false,
    ariaLabel: undefined,
    loading: false,
    disabled: false,
});

const isDesktop = useIsDesktop();
</script>

<template>
    <Button
        v-if="isDesktop"
        :label="label"
        :aria-label="ariaLabel ?? label"
        :icon="icon"
        :severity="primary ? undefined : 'secondary'"
        :outlined="!primary"
        :loading="loading"
        :disabled="disabled"
    />
    <Button
        v-else
        :icon="icon"
        :aria-label="ariaLabel ?? label"
        severity="secondary"
        text
        rounded
        :loading="loading"
        :disabled="disabled"
    />
</template>
