<script setup lang="ts">
/**
 * The monthly spending strip: one bar per month over a sliding window, with side arrows,
 * tap-tap and drag selection, and edge auto-scroll while dragging. Presentational: totals and
 * the first month come in as props. The range, the window and any pending selection are models.
 */
import {
    STRIP_EDGE_SCROLL_MS,
    STRIP_SLIDE_STEP,
    barHeightPercent,
    classifyGesture,
    edgeDirection,
    monthAtOffset,
    previewRange,
    edgeZonePx,
    slideWindow,
    stripAverage,
    stripBounds,
    stripMonthLabel,
    stripMonths,
    tapMonth,
    windowToShow,
    type StripInteraction,
} from "~/utils/monthStrip";
import { addMonths, monthIndex, monthKeyOf, rangeFromEnds, type MonthKey, type MonthRange } from "~/utils/monthRange";

const props = defineProps<{
    totals: Record<MonthKey, number>;
    firstMonth: MonthKey | null;
    /** The page's clock: the newest window ends at this month. The page passes it so the strip follows the month. */
    now: Date;
    visibleCount: number;
    formatAmount: (n: number) => string;
}>();

const range = defineModel<MonthRange>({ required: true });
const windowStart = defineModel<MonthKey>("windowStart", { required: true });
const interaction = defineModel<StripInteraction>("interaction", { default: () => ({ kind: "idle" }) });

const isDesktop = useIsDesktop();

// The page's clock ticks every minute, but the strip only moves when the month changes: bounds key on the month.
const currentMonth = computed(() => monthKeyOf(props.now));
const bounds = computed(() => stripBounds(props.firstMonth, currentMonth.value, props.visibleCount));
const months = computed(() => stripMonths(bounds.value, props.visibleCount));
const windowEnd = computed(() => addMonths(windowStart.value, props.visibleCount - 1));
const inWindow = (month: MonthKey) => month >= windowStart.value && month <= windowEnd.value;
const visibleMonths = computed(() => months.value.filter(inWindow));

const average = computed(() => stripAverage(props.totals, visibleMonths.value, props.firstMonth));
// The tallest bar sets the scale for the visible months. The average line can sit above every bar.
const visibleMax = computed(() => {
    let max = average.value ?? 0;
    for (const month of visibleMonths.value) {
        const total: number | undefined = props.totals[month];
        if (total !== undefined && total > max) max = total;
    }
    return max;
});

const atOldest = computed(() => windowStart.value <= bounds.value.lowestStart);
const atNewest = computed(() => windowStart.value >= bounds.value.highestStart);

const hovered = ref<MonthKey | null>(null);
const previewSpan = computed(() => previewRange(interaction.value, hovered.value));
// The band and the bar colours follow the preview while selecting, and the committed range otherwise.
const bandSpan = computed<MonthRange>(() => previewSpan.value ?? range.value);
const pendingStart = computed(() => (interaction.value.kind === "pending" ? interaction.value.start : null));
const dragging = computed(() => interaction.value.kind === "dragging");

const trackStyle = computed(() => {
    const count = months.value.length;
    const offset = monthIndex(windowStart.value) - monthIndex(bounds.value.lowestStart);
    return {
        width: `${(count / props.visibleCount) * 100}%`,
        transform: `translateX(${(-offset / count) * 100}%)`,
    };
});

const inSpan = (span: MonthRange | null, month: MonthKey) => span !== null && month >= span.from && month <= span.to;

function barClass(month: MonthKey): string {
    if (inSpan(previewSpan.value, month)) return "bg-primary/50";
    if (inSpan(range.value, month)) return "bg-primary";
    return "bg-surface-300 dark:bg-surface-600";
}

function bandClass(month: MonthKey): string {
    const span = bandSpan.value;
    if (!inSpan(span, month)) return "";
    return [
        "bg-primary/10 dark:bg-primary/15",
        month === span.from && "rounded-l-md",
        month === span.to && "rounded-r-md",
    ]
        .filter(Boolean)
        .join(" ");
}

function barLabel(month: MonthKey, total: number): string {
    return `${stripMonthLabel(month).month} ${month.slice(0, 4)}: ${props.formatAmount(total)}`;
}

function slide(delta: number) {
    windowStart.value = slideWindow(windowStart.value, delta, bounds.value);
}

// Keyboard clicks have detail 0. Pointer taps are handled in onPointerUp, so their click (detail 1) is ignored here.
function onBarClick(month: MonthKey, event: MouseEvent) {
    if (event.detail !== 0) return;
    applyTap(month, interaction.value);
}

function applyTap(month: MonthKey, from: StripInteraction) {
    const result = tapMonth(from, month);
    interaction.value = result.interaction;
    if (result.commit) range.value = result.commit;
}

// Follow the range: when it is set from outside (or by a tap), slide the window just enough to show it. Bounds
// are a source too: the first month arrives after the first page, so a range older than the window is shown then.
// The sources are compared by value. A new range or bounds object with the same months must not move a window
// the user has browsed away from the range.
watch(
    [() => range.value.from, () => range.value.to, () => bounds.value.lowestStart, () => bounds.value.highestStart],
    () => {
        windowStart.value = windowToShow(windowStart.value, range.value, props.visibleCount, bounds.value);
    },
    { immediate: true },
);

interface Press {
    pointerId: number;
    pointerType: string;
    x0: number;
    y0: number;
    startMonth: MonthKey;
    before: StripInteraction;
    started: boolean;
    current: MonthKey;
}

const EDGE_PX = 24;

const viewport = ref<HTMLElement | null>(null);
let press: Press | null = null;
let edgeTimer: ReturnType<typeof setInterval> | null = null;
let edgeDir: -1 | 1 | null = null;

// The track is slid with a transform, so the viewport's own scroll must stay at 0. A focus that scrolls it would
// put the pointer mapping out of step with windowStart.
function resetScroll() {
    if (viewport.value && viewport.value.scrollLeft !== 0) viewport.value.scrollLeft = 0;
}

function metrics(clientX: number): { x: number; width: number } {
    const rect = viewport.value?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), width: rect?.width ?? 0 };
}

function monthAt(clientX: number): MonthKey {
    const { x, width } = metrics(clientX);
    return monthAtOffset(x, width, windowStart.value, props.visibleCount);
}

function stopEdge() {
    if (edgeTimer !== null) clearInterval(edgeTimer);
    edgeTimer = null;
    edgeDir = null;
}

function reset() {
    press = null;
    stopEdge();
}

function tickEdge(dir: -1 | 1) {
    const next = slideWindow(windowStart.value, dir, bounds.value);
    if (next === windowStart.value) {
        stopEdge();
        return;
    }
    windowStart.value = next;
    if (press?.started) {
        // The pointer has not moved, so the month under it is now the window's new edge month.
        const current = dir < 0 ? next : addMonths(next, props.visibleCount - 1);
        press.current = current;
        interaction.value = { kind: "dragging", anchor: press.startMonth, current };
    }
}

function updateEdge(x: number, width: number) {
    const dir = edgeDirection(x, width, edgeZonePx(width, props.visibleCount, EDGE_PX));
    if (dir === 0) {
        stopEdge();
        return;
    }
    if (edgeTimer !== null && edgeDir === dir) return;
    stopEdge();
    edgeDir = dir;
    edgeTimer = setInterval(() => tickEdge(dir), STRIP_EDGE_SCROLL_MS[isDesktop.value ? "desktop" : "mobile"]);
}

function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    // Capture from the start so the release lands on the viewport even when the press never becomes a drag.
    viewport.value?.setPointerCapture(event.pointerId);
    const startMonth = monthAt(event.clientX);
    press = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        x0: event.clientX,
        y0: event.clientY,
        startMonth,
        before: interaction.value,
        started: false,
        current: startMonth,
    };
}

function onPointerMove(event: PointerEvent) {
    const { x, width } = metrics(event.clientX);
    if (!press || press.pointerId !== event.pointerId) {
        // No press: a mouse hover previews the span from a pending start.
        if (event.pointerType === "mouse")
            hovered.value = monthAtOffset(x, width, windowStart.value, props.visibleCount);
        return;
    }

    if (!press.started) {
        if (press.pointerType === "mouse") {
            if (monthAt(event.clientX) === press.startMonth) return;
        } else {
            const gesture = classifyGesture(event.clientX - press.x0, event.clientY - press.y0);
            if (gesture === "undecided") return;
            // A vertical touch is the page scrolling: drop the gesture and leave it alone.
            if (gesture === "vertical") {
                reset();
                return;
            }
        }
        press.started = true;
    }

    const current = monthAtOffset(x, width, windowStart.value, props.visibleCount);
    press.current = current;
    interaction.value = { kind: "dragging", anchor: press.startMonth, current };
    updateEdge(x, width);
}

function onPointerUp(event: PointerEvent) {
    if (!press || press.pointerId !== event.pointerId) return;
    const ended = press;
    reset();

    if (ended.started) {
        range.value = rangeFromEnds(ended.startMonth, ended.current);
        interaction.value = { kind: "idle" };
        return;
    }
    applyTap(ended.startMonth, ended.before);
}

// A cancelled or stolen pointer puts back the selection it started from.
function cancelPress(event: PointerEvent) {
    if (!press || press.pointerId !== event.pointerId) return;
    interaction.value = press.before;
    reset();
}

function onEscape() {
    reset();
    interaction.value = { kind: "idle" };
}

onBeforeUnmount(stopEdge);
</script>

<template>
    <div class="flex items-center gap-1">
        <Button
            icon="pi pi-chevron-left"
            text
            rounded
            severity="secondary"
            class="h-8 w-8 shrink-0"
            aria-label="Earlier months"
            :disabled="atOldest"
            @click="slide(-STRIP_SLIDE_STEP)"
        />

        <div
            ref="viewport"
            class="relative min-w-0 flex-1 overflow-hidden select-none"
            style="touch-action: pan-y"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="cancelPress"
            @lostpointercapture="cancelPress"
            @pointerleave="hovered = null"
            @keydown.esc="onEscape"
            @scroll="resetScroll"
        >
            <div
                class="flex transition-transform"
                :class="dragging ? 'duration-100' : 'duration-300'"
                :style="trackStyle"
            >
                <div
                    v-for="(month, i) in months"
                    :key="month"
                    :data-month="month"
                    class="flex shrink-0 flex-col"
                    :class="bandClass(month)"
                    :style="{ width: `${100 / months.length}%` }"
                >
                    <div class="relative flex h-28 items-end px-[2px] md:h-36">
                        <Skeleton
                            v-if="totals[month] === undefined"
                            :height="`${30 + ((i * 37) % 50)}%`"
                            class="w-full"
                        />
                        <button
                            v-else
                            type="button"
                            class="w-full rounded-t-sm transition-[height]"
                            :class="[
                                barClass(month),
                                pendingStart === month && 'outline-dashed outline-2 outline-offset-1 outline-primary',
                            ]"
                            :style="{ height: `${barHeightPercent(totals[month], visibleMax)}%` }"
                            :title="barLabel(month, totals[month])"
                            :aria-label="barLabel(month, totals[month])"
                            :aria-pressed="inSpan(range, month)"
                            :tabindex="inWindow(month) ? undefined : -1"
                            @click="onBarClick(month, $event)"
                        />
                        <span
                            v-if="average !== null"
                            class="pointer-events-none absolute inset-x-0 border-t border-dashed border-surface-400 dark:border-surface-500"
                            :style="{ bottom: `${barHeightPercent(average, visibleMax)}%` }"
                        />
                    </div>
                    <div class="pt-1 text-center text-[10px] leading-tight text-muted-color">
                        <div>{{ stripMonthLabel(month).month }}</div>
                        <div v-if="stripMonthLabel(month).year">{{ stripMonthLabel(month).year }}</div>
                    </div>
                </div>
            </div>
        </div>

        <Button
            icon="pi pi-chevron-right"
            text
            rounded
            severity="secondary"
            class="h-8 w-8 shrink-0"
            aria-label="Later months"
            :disabled="atNewest"
            @click="slide(STRIP_SLIDE_STEP)"
        />
    </div>
</template>
