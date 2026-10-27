<script setup lang="ts">
import type { DatePickerPassThroughMethodOptions } from "primevue/datepicker";
import {
    PERIOD_PRESET_LABELS,
    applyGridEmit,
    matchPreset,
    monthBandCell,
    monthKeyOf,
    monthPickHint,
    presetSelection,
    type MonthBandCell,
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

// The grid's upper bound: the last day of this month, so future months are disabled. PrimeVue clamps a click on a
// later month to this date, never to the 1st.
const maxDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

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

// The range band, drawn per cell. Only a completed range is a band: while a start is pending the grid shows just
// that month, with the dashed ring. Every cell takes `w-1/3 my-0.5`, which closes the sub-pixel gap between
// columns and separates rows, so one row reads as one band.
const band = computed(() => (pendingStart.value === null && selection.value.kind === "range" ? selection.value : null));

// Literal class strings, so Tailwind sees them. The row cap is `rounded-*-sm` (2px), a third of the cell radius
// (`rounded-*-md`), so a wrapped row edge never reads as a range end. This is a deliberate exception to
// apps/web/AGENTS.md's "keep PrimeVue radii" rule: PrimeVue's month range fills every month alike, so the band
// is drawn by hand. Tailwind utilities sit above the `primevue` layer and need no `!`.
const bandClass = (cell: MonthBandCell): string | undefined => {
    const left = cell.capLeft ? "rounded-l-sm" : "rounded-l-none";
    const right = cell.capRight ? "rounded-r-sm" : "rounded-r-none";
    switch (cell.role) {
        case "none":
            return undefined;
        case "single":
            return "bg-primary text-primary-contrast rounded-md";
        case "pending":
            return "rounded-md bg-transparent text-primary outline-dashed outline-2 -outline-offset-2 outline-primary";
        case "start":
            return `bg-primary text-primary-contrast rounded-l-md ${right}`;
        case "end":
            return `bg-primary text-primary-contrast rounded-r-md ${left}`;
        case "middle":
            return `bg-[var(--p-highlight-background)] text-color ${left} ${right}`;
    }
};

const bandCap = (cell: MonthBandCell): "both" | "left" | "right" | undefined => {
    if (cell.capLeft && cell.capRight) return "both";
    if (cell.capLeft) return "left";
    if (cell.capRight) return "right";
    return undefined;
};

const monthPt = {
    month: ({ state, context }: DatePickerPassThroughMethodOptions) => {
        const cell = monthBandCell(state.currentYear, context.monthIndex, band.value, pendingStart.value);
        return {
            class: ["w-1/3 my-0.5", bandClass(cell)],
            "data-band": cell.role === "none" ? undefined : cell.role,
            "data-band-cap": bandCap(cell),
        };
    },
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
    // PrimeVue does not block a click on a future month; it clamps the click to `maxDate`. A real month click is
    // always the 1st, so any emitted `maxDate` is a future click to drop.
    if (Array.isArray(value) && value.some((date) => date?.getTime() === maxDate.getTime())) return;
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
            :max-date="maxDate"
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
