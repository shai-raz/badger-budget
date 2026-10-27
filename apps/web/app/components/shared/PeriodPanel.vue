<script setup lang="ts">
import {
    PERIOD_PRESET_LABELS,
    applyGridEmit,
    matchPreset,
    monthKeyOf,
    monthPickHint,
    presetSelection,
    type MonthKey,
    type PeriodPresetId,
    type PeriodSelection,
} from "~/utils/monthRange";

const props = defineProps<{
    presets: readonly PeriodPresetId[];
    layout: "side" | "stacked";
}>();

const selection = defineModel<PeriodSelection>({ required: true });

const emit = defineEmits<{ done: [] }>();

// Captured once per open, so the presets, the disabled future months and the matched preset all agree.
const now = new Date();

// The month of a first grid click, waiting for the second. Only ever set while the panel is open: PrimeVue
// unmounts the panel on every close, so an unfinished pick is discarded with it.
const pendingStart = ref<MonthKey | null>(null);

const activePreset = computed(() => matchPreset(selection.value, props.presets, now));

const presetOptions = computed(() => props.presets.map((id) => ({ id, label: PERIOD_PRESET_LABELS[id] })));

const monthStart = (key: MonthKey): Date => {
    const [year = 0, month = 1] = key.split("-").map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, 1);
    date.setHours(0, 0, 0, 0);
    return date;
};

// While a month is pending, PrimeVue sees `[start, null]`, so its next click completes the range.
const gridValue = computed<(Date | null)[] | null>(() => {
    if (pendingStart.value !== null) return [monthStart(pendingStart.value), null];
    if (selection.value.kind === "all") return null;
    return [monthStart(selection.value.from), monthStart(selection.value.to)];
});

// The pending ring. PrimeVue marks only the start's year in the `[start, null]` state, so `selected` here
// lands on the pending cell alone; once a range is complete no cell carries the ring.
const monthPt = {
    month: ({ context }: { context: { selected: boolean } }) => ({
        class:
            pendingStart.value !== null && context.selected
                ? "bg-transparent text-primary outline-dashed outline-2 -outline-offset-2 outline-primary"
                : undefined,
    }),
};

const choosePreset = (id: PeriodPresetId | null) => {
    if (id === null) return;
    pendingStart.value = null;
    selection.value = presetSelection(id, now);
    emit("done");
};

// PrimeVue's range grid emits `[start, end]`, or `[clicked, null]` when a click starts a new range. The month
// logic in `applyGridEmit` reads both, so the result does not depend on which month was clicked first. A first
// click selects its month and keeps the panel open; the second completes the range and closes it.
const onGridUpdate = (value: Date | Date[] | (Date | null)[] | null | undefined) => {
    // PrimeVue does not block a click on a future month, and clamps it to the max date (not the 1st). Ignore that.
    if (Array.isArray(value) && value.some((date) => date && date.getDate() !== 1)) return;
    const emitted = Array.isArray(value) ? value.map((date) => (date ? monthKeyOf(date) : null)) : null;
    const [first = null, second = null] = emitted ?? [];
    const result = applyGridEmit(pendingStart.value, emitted === null ? null : [first, second]);

    pendingStart.value = result.pendingStart;
    if (result.commit) selection.value = result.commit;
    if (result.close) emit("done");
};
</script>

<template>
    <div :class="layout === 'side' ? 'flex items-start gap-3' : 'flex flex-col gap-3'">
        <Listbox
            v-if="layout === 'side'"
            :model-value="activePreset"
            :options="presetOptions"
            option-label="label"
            option-value="id"
            class="w-40 shrink-0"
            scroll-height="none"
            :pt="{ root: { class: 'border-0' } }"
            aria-label="Period presets"
            @update:model-value="choosePreset"
        />
        <div
            v-else
            class="flex flex-wrap gap-2"
        >
            <Button
                v-for="option in presetOptions"
                :key="option.id"
                size="small"
                rounded
                :outlined="activePreset !== option.id"
                :severity="activePreset === option.id ? undefined : 'secondary'"
                :label="option.label"
                @click="choosePreset(option.id)"
            />
        </div>
        <DatePicker
            inline
            view="month"
            selection-mode="range"
            date-format="mm/yy"
            :max-date="now"
            :model-value="gridValue"
            :pt="monthPt"
            aria-label="Month range"
            @update:model-value="onGridUpdate"
        >
            <template #footer>
                <!-- One persistent live region: it announces the first pick and the reset after a range. -->
                <p
                    aria-live="polite"
                    class="mt-2 text-center text-xs"
                    :class="pendingStart ? 'font-medium text-surface-900 dark:text-surface-0' : 'text-muted-color'"
                >
                    {{ monthPickHint(pendingStart, { touch: layout === "stacked" }) }}
                </p>
            </template>
        </DatePicker>
    </div>
</template>
