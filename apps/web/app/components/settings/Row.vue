<script setup lang="ts">
/**
 * One settings row: icon, title, optional subtitle and a trailing chevron (`to`,
 * an internal route), an external-link arrow (`href`), or nothing (button mode,
 * which emits `click`). Every row on the Settings page is built from this, so
 * all three modes share one look.
 */
import { resolveComponent } from "vue";
import Button from "primevue/button";
import type { StatusTagTone } from "~/utils/statusTag";

interface Props {
    title: string;
    /** PrimeIcons class, e.g. "pi pi-palette". */
    icon: string;
    /** Internal route: renders a NuxtLink with a chevron. */
    to?: string;
    /** External URL: renders <a target="_blank" rel="noopener"> with a pi-arrow-up-right icon instead of the chevron. */
    href?: string;
    subtitle?: string | null;
    /** Shows a Skeleton line where the subtitle goes. */
    loading?: boolean;
    tag?: { value: string; tone?: StatusTagTone };
    /** bg-primary dot on the icon (same look as the PageHeader update badge). */
    dot?: boolean;
    /** Red icon and title, no chevron (Log out). */
    danger?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    to: undefined,
    href: undefined,
    subtitle: undefined,
    loading: false,
    tag: undefined,
    dot: false,
    danger: false,
});

const emit = defineEmits<{ click: [] }>();

const NuxtLinkTag = resolveComponent("NuxtLink");

// The three modes share one inner template: the root is a component (or the
// `a` tag), and the content goes in its default slot.
const rootTag = computed(() => {
    if (props.to) return NuxtLinkTag;
    if (props.href) return "a";
    return Button;
});

const rootAttrs = computed(() => {
    if (props.to) return { to: props.to };
    if (props.href) return { href: props.href, target: "_blank", rel: "noopener" };
    return { type: "button", unstyled: true };
});

const onClick = () => {
    if (!props.to && !props.href) emit("click");
};
</script>

<template>
    <component
        :is="rootTag"
        v-bind="rootAttrs"
        class="flex w-full items-center gap-3 px-4 py-3 text-left md:px-0"
        @click="onClick"
    >
        <span class="relative flex shrink-0">
            <i
                :class="[icon, danger ? 'text-red-500' : 'text-muted-color']"
                aria-hidden="true"
            />
            <span
                v-if="dot"
                class="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface-0 dark:ring-surface-900"
                aria-hidden="true"
            />
        </span>

        <span class="flex min-w-0 flex-1 flex-col">
            <span :class="['text-sm font-semibold', danger && 'text-red-500']">{{ title }}</span>
            <Skeleton
                v-if="loading"
                width="8rem"
                height="0.75rem"
                class="mt-1"
            />
            <span
                v-else-if="subtitle"
                class="truncate text-xs text-muted-color"
            >
                {{ subtitle }}
            </span>
        </span>

        <SharedStatusTag
            v-if="tag"
            :value="tag.value"
            :tone="tag.tone"
            class="shrink-0"
        />

        <i
            v-if="href"
            class="pi pi-arrow-up-right text-surface-400"
            aria-hidden="true"
        />
        <i
            v-else-if="!danger"
            class="pi pi-chevron-right text-surface-400"
            aria-hidden="true"
        />
        <span
            v-if="href"
            class="sr-only"
            >(opens in a new tab)</span
        >
    </component>
</template>
