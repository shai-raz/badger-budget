import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import MonthStrip from "./MonthStrip.vue";
import type { MonthRange } from "~/utils/monthRange";

// Oct 26 2026: the current month is Oct 2026, so the newest 12-month window is Nov 2025 through Oct 2026.
const NOW = new Date(2026, 9, 26);

mockNuxtImport("useIsDesktop", () => () => ref(true));

const TOTALS: Record<string, number> = {
    "2025-11": 1200,
    "2025-12": 1800,
    "2026-01": 1500,
    "2026-02": 1100,
    "2026-03": 1300,
    "2026-04": 1250,
    "2026-05": 1400,
    "2026-06": 1350,
    "2026-07": 1600,
    "2026-08": 1450,
    "2026-09": 1380,
    "2026-10": 900,
};

const OCT_2026: MonthRange = { kind: "range", from: "2026-10", to: "2026-10" };

const mounted: { unmount: () => void }[] = [];

const mountStrip = async (
    options: { totals?: Record<string, number>; firstMonth?: string | null; range?: MonthRange } = {},
) => {
    const wrapper = await mountSuspended(MonthStrip, {
        props: {
            totals: options.totals ?? TOTALS,
            firstMonth: options.firstMonth === undefined ? "2024-01" : options.firstMonth,
            now: NOW,
            visibleCount: 12,
            formatAmount: (n: number) => `$${n}`,
            modelValue: options.range ?? OCT_2026,
            windowStart: "2025-11",
        },
    });
    mounted.push(wrapper);
    return wrapper;
};

type Wrapper = Awaited<ReturnType<typeof mountStrip>>;

const bar = (wrapper: Wrapper, month: string) => wrapper.find(`[data-month="${month}"] button`);
const earlierArrow = (wrapper: Wrapper) => wrapper.find('[aria-label="Earlier months"]');
const laterArrow = (wrapper: Wrapper) => wrapper.find('[aria-label="Later months"]');

const lastEmit = (wrapper: Wrapper, event: string) => {
    const emits = wrapper.emitted(event) ?? [];
    return emits[emits.length - 1]?.[0];
};

describe("MonthStrip", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
        vi.useRealTimers();
    });

    it("renders a bar per loaded month and presses only the selected month", async () => {
        const wrapper = await mountStrip();

        const bars = wrapper.findAll("[data-month] button");
        expect(bars.length).toBeGreaterThanOrEqual(12);

        const pressed = bars
            .filter((button) => button.attributes("aria-pressed") === "true")
            .map((button) => button.element.closest("[data-month]")?.getAttribute("data-month"));
        expect(pressed).toEqual(["2026-10"]);
    });

    it("starts a pending selection on a keyboard tap and slides the window without changing the range", async () => {
        const wrapper = await mountStrip();

        await bar(wrapper, "2026-07").trigger("click");
        expect(lastEmit(wrapper, "update:interaction")).toEqual({ kind: "pending", start: "2026-07" });

        await earlierArrow(wrapper).trigger("click");

        expect(wrapper.emitted("update:windowStart")).toBeDefined();
        expect(wrapper.emitted("update:modelValue")).toBeUndefined();
        expect(lastEmit(wrapper, "update:interaction")).toEqual({ kind: "pending", start: "2026-07" });
    });

    it("commits the range between two keyboard taps in either order", async () => {
        const wrapper = await mountStrip();

        await bar(wrapper, "2026-07").trigger("click");
        await bar(wrapper, "2026-03").trigger("click");

        expect(lastEmit(wrapper, "update:modelValue")).toEqual({ kind: "range", from: "2026-03", to: "2026-07" });
        expect(lastEmit(wrapper, "update:interaction")).toEqual({ kind: "idle" });
    });

    it("never changes the range when only an arrow is clicked", async () => {
        const wrapper = await mountStrip();

        await earlierArrow(wrapper).trigger("click");
        await laterArrow(wrapper).trigger("click");

        expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    });

    it("shows a skeleton bar for each month without a total", async () => {
        const wrapper = await mountStrip({ totals: {} });

        expect(wrapper.find('[data-month="2026-10"] .p-skeleton').exists()).toBe(true);
        expect(wrapper.find('[data-month="2026-10"] .h-28').exists()).toBe(true);
        expect(wrapper.find('[data-month="2026-10"] button').exists()).toBe(false);
    });

    it("disables the earlier arrow when there is no first month", async () => {
        const wrapper = await mountStrip({ firstMonth: null });

        expect(earlierArrow(wrapper).attributes("disabled")).toBeDefined();
    });

    it("takes only the visible window's bars out of the tab order", async () => {
        const wrapper = await mountStrip({ totals: { ...TOTALS, "2025-05": 900 } });

        // The window is 2025-11 through 2026-10. Bars outside it sit off-screen inside the overflow-hidden track.
        expect(bar(wrapper, "2025-05").attributes("tabindex")).toBe("-1");
        expect(bar(wrapper, "2026-10").attributes("tabindex")).toBeUndefined();
    });

    it("keeps the viewport at scroll position zero when it is scrolled", async () => {
        const wrapper = await mountStrip();

        const viewport = wrapper.find(".overflow-hidden").element as HTMLElement;
        viewport.scrollLeft = 40;
        await wrapper.find(".overflow-hidden").trigger("scroll");

        expect(viewport.scrollLeft).toBe(0);
    });

    it("shows a month that starts after mount once the page's clock moves on", async () => {
        const wrapper = await mountStrip();
        const NOV_2026: MonthRange = { kind: "range", from: "2026-11", to: "2026-11" };

        // The page ticks from Oct 26 into November: the newest window now ends at Nov 2026.
        await wrapper.setProps({
            now: new Date(2026, 10, 1),
            totals: { ...TOTALS, "2026-11": 700 },
            modelValue: NOV_2026,
        });

        expect(bar(wrapper, "2026-11").exists()).toBe(true);
    });
});
