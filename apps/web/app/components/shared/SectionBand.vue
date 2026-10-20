<script setup lang="ts">
/**
 * The section used by every app page: a full-width band with a label row on
 * mobile, and a card on desktop (`card`). Handles the header, loading, error
 * and empty states, so a page section only supplies its content.
 */
interface Props {
    /** Section heading, e.g. "Accounts". */
    title: string;
    /** Heading shown below md instead of `title`, when mobile needs a shorter
     * label (e.g. "Recent" for "Recent transactions"). Defaults to `title`. */
    mobileTitle?: string;
    /** Right-aligned header text, e.g. "4 active · 1 over". */
    meta?: string;
    /** Route for the header's "see all" link, e.g. "/transactions". */
    linkTo?: string;
    /** Label for the header link, e.g. "All transactions". */
    linkLabel?: string;
    loading?: boolean;
    /** Truthy renders an inline error message instead of the content/skeleton. */
    error?: unknown;
    empty?: boolean;
    /** PrimeIcon suffix for the default empty state, e.g. "pi-inbox". */
    emptyIcon?: string;
    emptyText?: string;
    /** Desktop card chrome (border/padding/rounding). Off for sections that lay
     * out their own Cards (e.g. Accounts). */
    card?: boolean;
    /** Dims the content while keeping it on screen, e.g. while a refetch runs. */
    refreshing?: boolean;
}

withDefaults(defineProps<Props>(), {
    mobileTitle: undefined,
    meta: undefined,
    linkTo: undefined,
    linkLabel: undefined,
    loading: false,
    error: undefined,
    empty: false,
    emptyIcon: "pi-inbox",
    emptyText: undefined,
    card: true,
    refreshing: false,
});
</script>

<template>
    <section
        class="border-y border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900"
        :class="
            card
                ? 'md:rounded-xl md:border md:border-surface-200 md:bg-surface-0 md:p-5 dark:md:border-surface-700 dark:md:bg-surface-900'
                : 'md:border-0 md:bg-transparent dark:md:bg-transparent'
        "
    >
        <div class="flex items-center justify-between gap-2 px-4 pt-3 pb-2 md:px-0 md:pt-0 md:pb-3">
            <h2
                class="text-xs font-semibold uppercase tracking-wide text-muted-color md:text-base md:font-semibold md:normal-case md:tracking-normal md:text-surface-900 dark:md:text-surface-0"
            >
                <slot name="label">
                    <span class="md:hidden">{{ mobileTitle ?? title }}</span>
                    <span class="hidden md:inline">{{ title }}</span>
                </slot>
            </h2>
            <div class="flex items-center gap-2 text-xs normal-case">
                <span
                    v-if="meta"
                    class="text-muted-color"
                >
                    {{ meta }}
                </span>
                <NuxtLink
                    v-if="linkTo"
                    :to="linkTo"
                    class="text-primary hover:underline"
                >
                    {{ linkLabel }} &rsaquo;
                </NuxtLink>
                <slot name="header-extra" />
            </div>
        </div>

        <Message
            v-if="error"
            class="mx-4 mb-3 md:mx-0 md:mb-0"
            severity="error"
            :closable="false"
        >
            Couldn't load {{ title.toLowerCase() }}.
        </Message>

        <template v-else-if="loading">
            <slot name="skeleton">
                <div class="flex flex-col gap-2 px-4 pb-3 md:px-0 md:pb-0">
                    <Skeleton height="2.5rem" />
                    <Skeleton height="2.5rem" />
                    <Skeleton height="2.5rem" />
                </div>
            </slot>
        </template>

        <template v-else-if="empty">
            <slot name="empty">
                <SharedEmptyState
                    :icon="emptyIcon"
                    :text="emptyText"
                />
            </slot>
        </template>

        <div
            v-else
            class="transition-opacity duration-200 ease-out"
            :class="refreshing ? 'pointer-events-none opacity-40' : 'opacity-100'"
        >
            <slot />
        </div>
    </section>
</template>
