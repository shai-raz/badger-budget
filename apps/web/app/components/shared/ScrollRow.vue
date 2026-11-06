<script setup lang="ts">
/**
 * A sideways-scrolling row: no visible scrollbar, a vertical wheel turn scrolls it, and edge arrows show only
 * on the side that can scroll. The arrows sit over the edges on a backing, so they never shift the content.
 */
import { useEventListener } from "@vueuse/core";
import { SCROLL_ROW_STEP_RATIO, scrollRowEdges, wheelToHorizontal } from "~/utils/scrollRow";

withDefaults(
    defineProps<{
        /** Edge arrows for mouse and keyboard users. */
        arrows?: boolean;
        /** Accessible name of the row. */
        label?: string;
        /** Background behind each edge arrow. Match the surface the row sits on. */
        backdropClass?: string;
    }>(),
    { arrows: true, label: undefined, backdropClass: "bg-surface-0 dark:bg-surface-900" },
);

const track = ref<HTMLElement | null>(null);
const canScrollStart = ref(false);
const canScrollEnd = ref(false);

function updateEdges() {
    const el = track.value;
    if (!el) return;
    const edges = scrollRowEdges(el);
    canScrollStart.value = edges.canScrollStart;
    canScrollEnd.value = edges.canScrollEnd;
}

useEventListener(track, "scroll", updateEdges, { passive: true });

// The wheel is only taken while the row can move that way. At an end it falls through, so the page still scrolls.
useEventListener(
    track,
    "wheel",
    (event: WheelEvent) => {
        const el = track.value;
        if (!el) return;
        const delta = wheelToHorizontal(event.deltaX, event.deltaY);
        if (delta === null) return;
        const edges = scrollRowEdges(el);
        if (delta > 0 ? !edges.canScrollEnd : !edges.canScrollStart) return;
        event.preventDefault();
        el.scrollBy({ left: delta });
    },
    { passive: false },
);

// Content can grow or shrink without the track resizing (a picker label changes width), and that fires no scroll
// event. So the track and each of its children are observed, and the child list is re-read when it changes.
let sizes: ResizeObserver | null = null;
let children: MutationObserver | null = null;

function observeSizes() {
    const el = track.value;
    if (!el || !sizes) return;
    sizes.disconnect();
    sizes.observe(el);
    for (const child of Array.from(el.children)) sizes.observe(child);
    updateEdges();
}

onMounted(() => {
    const el = track.value;
    if (!el) return;
    sizes = new ResizeObserver(updateEdges);
    children = new MutationObserver(observeSizes);
    children.observe(el, { childList: true });
    observeSizes();
});

onBeforeUnmount(() => {
    sizes?.disconnect();
    children?.disconnect();
});

function scrollTrack(direction: -1 | 1) {
    const el = track.value;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * SCROLL_ROW_STEP_RATIO, behavior: "smooth" });
}
</script>

<template>
    <div class="relative min-w-0">
        <div
            ref="track"
            class="scroll-row-track flex items-center gap-2 overflow-x-auto py-1"
            role="region"
            :aria-label="label"
        >
            <slot />
        </div>

        <div
            v-if="arrows && canScrollStart"
            class="absolute inset-y-0 left-0 flex items-center"
            :class="backdropClass"
        >
            <Button
                icon="pi pi-chevron-left"
                text
                rounded
                size="small"
                severity="secondary"
                aria-label="Scroll left"
                @click="scrollTrack(-1)"
            />
        </div>

        <div
            v-if="arrows && canScrollEnd"
            class="absolute inset-y-0 right-0 flex items-center"
            :class="backdropClass"
        >
            <Button
                icon="pi pi-chevron-right"
                text
                rounded
                size="small"
                severity="secondary"
                aria-label="Scroll right"
                @click="scrollTrack(1)"
            />
        </div>
    </div>
</template>

<style scoped>
.scroll-row-track {
    scrollbar-width: none;
}

.scroll-row-track::-webkit-scrollbar {
    display: none;
}
</style>
