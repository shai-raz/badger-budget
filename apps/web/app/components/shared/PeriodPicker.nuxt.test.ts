import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import PeriodPicker from "./PeriodPicker.vue";
import { TRANSACTIONS_PRESETS, type PeriodSelection } from "~/utils/monthRange";

// Oct 26 2026: the current month is Oct 2026.
const NOW = new Date(2026, 9, 26);

// Toggled per test to cover the md+ and below-md layouts.
const layout = vi.hoisted(() => ({ desktop: true }));

mockNuxtImport("useIsDesktop", () => () => ref(layout.desktop));

const mountPicker = (modelValue: PeriodSelection) =>
    mountSuspended(PeriodPicker, {
        props: { modelValue, presets: TRANSACTIONS_PRESETS },
    });

type Wrapper = Awaited<ReturnType<typeof mountPicker>>;

const labelButton = (wrapper: Wrapper) => wrapper.find('[aria-haspopup="dialog"]');
const prevButton = (wrapper: Wrapper) => wrapper.find('[aria-label="Previous period"]');
const nextButton = (wrapper: Wrapper) => wrapper.find('[aria-label="Next period"]');
const thisMonthButton = (wrapper: Wrapper) =>
    wrapper.findAll("button").find((button) => button.text() === "This month");

const lastEmit = (wrapper: Wrapper) => {
    const emits = wrapper.emitted("update:modelValue") ?? [];
    return emits[emits.length - 1]?.[0];
};

describe("PeriodPicker", () => {
    beforeEach(() => {
        layout.desktop = true;
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("labels a single month and hides This month when it is the current month", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        expect(labelButton(wrapper).text()).toContain("Oct 2026");
        expect(nextButton(wrapper).attributes("disabled")).toBeDefined();
        expect(thisMonthButton(wrapper)).toBeUndefined();
    });

    it("steps a single month back by one month", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        await prevButton(wrapper).trigger("click");

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-09", to: "2026-09" });
    });

    it("steps a three-month range back by its own length", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-08", to: "2026-10" });

        await prevButton(wrapper).trigger("click");

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-05", to: "2026-07" });
    });

    it("steps a year-to-date range back by a year and labels it YTD", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-01", to: "2026-10" });

        expect(labelButton(wrapper).text()).toContain("YTD 2026");

        await prevButton(wrapper).trigger("click");

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2025-01", to: "2025-10" });
    });

    it("shows This month off the current month and selects it when clicked", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-09", to: "2026-09" });

        const link = thisMonthButton(wrapper);
        expect(link).toBeDefined();
        await link?.trigger("click");

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-10", to: "2026-10" });
    });

    it("labels all time and disables both arrows", async () => {
        const wrapper = await mountPicker({ kind: "all" });

        expect(labelButton(wrapper).text()).toContain("All time");
        expect(prevButton(wrapper).attributes("disabled")).toBeDefined();
        expect(nextButton(wrapper).attributes("disabled")).toBeDefined();
    });

    it("uses the short year label and no calendar icon below md", async () => {
        layout.desktop = false;
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        expect(labelButton(wrapper).text()).toContain("Oct ’26");
        expect(wrapper.find(".pi-calendar").exists()).toBe(false);
        expect(thisMonthButton(wrapper)).toBeUndefined();
    });
});
