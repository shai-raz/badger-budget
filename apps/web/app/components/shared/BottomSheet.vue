<script setup lang="ts">
/**
 * The bottom-sheet shell: a PrimeVue `Drawer` from the bottom with a drag handle that dismisses it, a visible title
 * row (with an optional `actions` slot at its right), a scrolling body and an optional pinned footer.
 *
 * `title` is always the dialog's accessible name, even when `hideTitle` drops the visible row, for a body that
 * supplies its own heading.
 */
interface Props {
    title: string;
    hideTitle?: boolean;
}

const props = withDefaults(defineProps<Props>(), { hideTitle: false });

const visible = defineModel<boolean>("visible", { default: false });

// Drag-to-dismiss on the handle. The drag target is resolved per drag through the `data-bottom-sheet` marker on the
// Drawer root, because PrimeVue mounts a fresh root on every open.
const handleEl = ref<HTMLElement | null>(null);

useDragToDismiss(handleEl, () => (handleEl.value?.closest("[data-bottom-sheet]") as HTMLElement | null) ?? null, {
    onDismiss: () => {
        visible.value = false;
    },
});

const pt = computed(() => ({
    root: {
        class: "rounded-t-[20px]",
        "data-bottom-sheet": "",
        "aria-label": props.title,
        style: { height: "auto", maxHeight: "80vh" },
    },
    header: { class: "hidden" },
    content: { class: "flex flex-col overflow-hidden p-0" },
}));
</script>

<template>
    <Drawer
        v-model:visible="visible"
        position="bottom"
        :show-close-icon="false"
        :block-scroll="true"
        :pt="pt"
    >
        <!-- Handle and title row: fixed at the top. The handle's padded wrapper is the only gesture hit area. -->
        <div class="shrink-0 px-4 pt-1">
            <div
                ref="handleEl"
                class="mx-auto mb-3 flex w-full cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
            >
                <div class="h-[5px] w-10 rounded-full bg-surface-300 dark:bg-surface-600"></div>
            </div>
            <div
                v-if="!hideTitle"
                class="mb-4 flex items-center justify-between gap-2"
            >
                <span class="text-base font-semibold text-surface-900 dark:text-surface-0">{{ title }}</span>
                <slot name="actions" />
            </div>
        </div>

        <!-- The only scrolling region. -->
        <div class="min-h-0 flex-1 overflow-y-auto px-4">
            <slot />
        </div>

        <div
            v-if="$slots.footer"
            class="shrink-0 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
            <slot name="footer" />
        </div>
    </Drawer>
</template>
