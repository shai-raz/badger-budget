<script setup lang="ts">
/**
 * The Reports "Monthly spending" band: the shared month strip over the paged monthly totals. It sits
 * above the report, so it stays mounted while the report loads or fails, and its errors stay in this band.
 */
import { useMonthlySpending } from "~/composables/reports/useMonthlySpending";
import { formatCurrency } from "~/utils/currency";
import { selectionLabel, type MonthRange } from "~/utils/monthRange";
import {
    clampWindowStart,
    pagesForWindow,
    previewRange,
    stripBounds,
    stripHint,
    STRIP_VISIBLE,
    type StripInteraction,
} from "~/utils/monthStrip";

const range = defineModel<MonthRange>({ required: true });

const isDesktop = useIsDesktop();
const visibleCount = computed(() => STRIP_VISIBLE[isDesktop.value ? "desktop" : "mobile"]);
// Read once per mount, like the strip: "now" only bounds the months shown.
const now = new Date();

// Starts on the newest window. Once the first month is known, the strip slides it to show the range.
const windowStart = ref(stripBounds(null, now, visibleCount.value).highestStart);
const pages = computed(() => pagesForWindow(windowStart.value, visibleCount.value, now));
const { totals, firstMonth, currency, error } = useMonthlySpending(pages, now);

const bounds = computed(() => stripBounds(firstMonth.value, now, visibleCount.value));
watch(visibleCount, () => {
    windowStart.value = clampWindowStart(windowStart.value, bounds.value);
});

const interaction = ref<StripInteraction>({ kind: "idle" });
const dragLabel = computed(() => {
    const span = previewRange(interaction.value, null);
    return interaction.value.kind === "dragging" && span
        ? selectionLabel(span, now, { shortYear: !isDesktop.value })
        : null;
});
const hint = computed(() => stripHint(interaction.value, { mobile: !isDesktop.value, dragLabel: dragLabel.value }));

const formatAmount = (amount: number) => formatCurrency(amount, currency.value?.code);
</script>

<template>
    <SharedSectionBand
        title="Monthly spending"
        :error="error && Object.keys(totals).length === 0 ? error : undefined"
    >
        <template
            v-if="isDesktop"
            #header-extra
        >
            <SharedStatusTag
                v-if="hint.kind === 'tag'"
                :value="hint.text"
            />
            <span
                v-else
                class="text-xs text-muted-color"
            >
                {{ hint.text }}
            </span>
        </template>

        <div class="px-4 pb-4 md:px-0 md:pb-0">
            <SharedMonthStrip
                v-model="range"
                v-model:window-start="windowStart"
                v-model:interaction="interaction"
                :totals="totals"
                :first-month="firstMonth"
                :visible-count="visibleCount"
                :format-amount="formatAmount"
            />
            <div
                v-if="!isDesktop"
                class="mt-2 flex justify-center"
            >
                <SharedStatusTag
                    v-if="hint.kind === 'tag'"
                    :value="hint.text"
                />
                <span
                    v-else
                    class="text-xs text-muted-color"
                >
                    {{ hint.text }}
                </span>
            </div>
        </div>
    </SharedSectionBand>
</template>
