<script setup lang="ts">
type MonthRange = {
    from: string;
    to: string;
};

// YYYY-MM strings, matching the shape used by the transactions store.
const selectedMonthRange = defineModel<MonthRange>({
    default: () => ({ from: "", to: "" }),
});

const toMonthString = (date: Date | null | undefined): string => {
    if (!date) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const toMonthDate = (month: string): Date | undefined => {
    if (!month) return undefined;
    const [year, monthNumber] = month.split("-").map(Number);
    if (!year || !monthNumber) return undefined;
    return new Date(year, monthNumber - 1, 1);
};

const fromDate = computed(() => toMonthDate(selectedMonthRange.value.from));
const toDate = computed(() => toMonthDate(selectedMonthRange.value.to));

// The pickers' min/max constraints already prevent an inverted range; the
// swap is a safety net for values written programmatically.
const writeRange = (range: MonthRange) => {
    if (range.from && range.to && range.from > range.to) {
        selectedMonthRange.value = { from: range.to, to: range.from };
        return;
    }
    selectedMonthRange.value = range;
};

const updateFrom = (value: unknown) => {
    writeRange({
        ...selectedMonthRange.value,
        from: toMonthString(value instanceof Date ? value : null),
    });
};

const updateTo = (value: unknown) => {
    writeRange({
        ...selectedMonthRange.value,
        to: toMonthString(value instanceof Date ? value : null),
    });
};

// PrimeVue pins the overlay's min-width to the (narrow) input, which squeezes
// the month grid; let the panel size to its content instead.
const panelPt = { panel: { style: { width: "max-content", minWidth: "18rem" } } };
</script>

<template>
    <div class="flex w-full items-center gap-2 md:w-auto">
        <DatePicker
            :model-value="fromDate"
            view="month"
            date-format="M yy"
            show-icon
            icon-display="input"
            :manual-input="false"
            :max-date="toDate"
            placeholder="From"
            class="min-w-0 flex-1 md:w-32 md:flex-none"
            fluid
            :pt="panelPt"
            aria-label="Start month"
            @update:model-value="updateFrom"
        />
        <span class="shrink-0 text-surface-500 dark:text-surface-300">to</span>
        <DatePicker
            :model-value="toDate"
            view="month"
            date-format="M yy"
            show-icon
            icon-display="input"
            :manual-input="false"
            :min-date="fromDate"
            placeholder="To"
            class="min-w-0 flex-1 md:w-32 md:flex-none"
            fluid
            :pt="panelPt"
            aria-label="End month"
            @update:model-value="updateTo"
        />
    </div>
</template>
