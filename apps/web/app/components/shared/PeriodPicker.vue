<script setup lang="ts">
import {
    canStepNext,
    currentMonthSelection,
    isCurrentMonthSelection,
    selectionLabel,
    stepRange,
    type PeriodPresetId,
    type PeriodSelection,
} from "~/utils/monthRange";

defineProps<{
    presets: readonly PeriodPresetId[];
}>();

const sel = defineModel<PeriodSelection>({ required: true });

const isDesktop = useIsDesktop();

// Re-read on every open, so a long-lived SPA that crosses midnight still labels and bounds against the right month.
const open = ref(false);
const now = computed(() => {
    void open.value;
    return new Date();
});

const canNext = computed(() => sel.value.kind === "range" && canStepNext(sel.value, now.value));

const step = (dir: -1 | 1) => {
    if (sel.value.kind === "all") return;
    sel.value = stepRange(sel.value, dir);
};

const popover = ref<{ toggle: (event: Event) => void; hide: () => void } | null>(null);

// md+ opens the popover anchored to the label; below md the label opens the bottom sheet.
const onLabelClick = (event: Event) => {
    if (isDesktop.value) {
        popover.value?.toggle(event);
    } else {
        open.value = true;
    }
};

// Drag-to-dismiss on the sheet handle. The drag target is found per drag (PrimeVue mounts a fresh root on each
// open), via the `data-period-sheet` marker set on the Drawer root below.
const handleEl = ref<HTMLElement | null>(null);

useDragToDismiss(handleEl, () => (handleEl.value?.closest("[data-period-sheet]") as HTMLElement | null) ?? null, {
    onDismiss: () => {
        open.value = false;
    },
});

const sheetPt = {
    root: {
        class: "rounded-t-[20px]",
        "data-period-sheet": "",
        style: { height: "auto", maxHeight: "80vh" },
    },
    header: { class: "hidden" },
    content: { class: "flex min-h-0 flex-col overflow-y-auto p-0" },
};
</script>

<template>
    <div class="flex items-center gap-1">
        <!-- Below md there is no room beside the arrows at 360px; the sheet's presets are the reset there. -->
        <Button
            v-if="isDesktop && !isCurrentMonthSelection(sel, now)"
            link
            size="small"
            label="This month"
            class="px-1 text-xs"
            @click="sel = currentMonthSelection(now)"
        />

        <ButtonGroup>
            <Button
                icon="pi pi-chevron-left"
                severity="secondary"
                outlined
                :class="isDesktop ? 'h-9 w-9' : 'h-8 w-8'"
                aria-label="Previous period"
                :disabled="sel.kind === 'all'"
                @click="step(-1)"
            />
            <Button
                severity="secondary"
                outlined
                aria-haspopup="dialog"
                :aria-expanded="open"
                :class="isDesktop ? 'h-9 min-w-0 max-w-[16rem]' : 'h-8 min-w-0 max-w-[12rem] px-2 text-sm'"
                @click="onLabelClick"
            >
                <i
                    v-if="isDesktop"
                    class="pi pi-calendar"
                    aria-hidden="true"
                ></i>
                <span class="truncate">{{ selectionLabel(sel, now, { shortYear: !isDesktop }) }}</span>
                <i
                    class="pi pi-chevron-down text-xs"
                    aria-hidden="true"
                ></i>
            </Button>
            <Button
                icon="pi pi-chevron-right"
                severity="secondary"
                outlined
                :class="isDesktop ? 'h-9 w-9' : 'h-8 w-8'"
                aria-label="Next period"
                :disabled="!canNext"
                @click="step(1)"
            />
        </ButtonGroup>

        <Popover
            ref="popover"
            @show="open = true"
            @hide="open = false"
        >
            <SharedPeriodPanel
                v-model="sel"
                :presets="presets"
                layout="side"
                @done="popover?.hide()"
            />
        </Popover>

        <Drawer
            v-model:visible="open"
            position="bottom"
            :show-close-icon="false"
            :block-scroll="true"
            :pt="sheetPt"
        >
            <div class="px-4 pt-1">
                <div
                    ref="handleEl"
                    class="mx-auto mb-3 flex w-full cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
                >
                    <div class="h-[5px] w-10 rounded-full bg-surface-300 dark:bg-surface-600"></div>
                </div>
                <span class="mb-4 block text-base font-semibold text-surface-900 dark:text-surface-0">Period</span>
            </div>
            <div class="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <SharedPeriodPanel
                    v-model="sel"
                    :presets="presets"
                    layout="stacked"
                    @done="open = false"
                />
            </div>
        </Drawer>
    </div>
</template>
