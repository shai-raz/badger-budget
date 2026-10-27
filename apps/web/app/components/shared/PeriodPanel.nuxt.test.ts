import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import PeriodPanel from "./PeriodPanel.vue";
import { TRANSACTIONS_PRESETS, type PeriodPresetId, type PeriodSelection } from "~/utils/monthRange";

// Oct 26 2026: the current month is Oct 2026 and Nov 2026 is in the future.
const NOW = new Date(2026, 9, 26);

const ALL: PeriodSelection = { kind: "all" };

const mountPanel = (opts: { layout?: "side" | "stacked"; presets?: readonly PeriodPresetId[] } = {}) =>
    mountSuspended(PeriodPanel, {
        props: {
            modelValue: ALL,
            presets: opts.presets ?? TRANSACTIONS_PRESETS,
            layout: opts.layout ?? "stacked",
        },
    });

/**
 * The month cell in the open month grid with this label (e.g. "Jul"). The first word is the label: a selected
 * cell also carries a hidden live region that repeats it.
 */
const monthCell = (wrapper: Awaited<ReturnType<typeof mountPanel>>, label: string) => {
    const cell = wrapper.findAll(".p-datepicker-month").find((element) => element.text().split(/\s+/)[0] === label);
    if (!cell) throw new Error(`Month cell not found: ${label}`);
    return cell;
};

const clickYearPrev = (wrapper: Awaited<ReturnType<typeof mountPanel>>) =>
    wrapper.find(".p-datepicker-prev-button").trigger("click");

const lastEmit = (wrapper: Awaited<ReturnType<typeof mountPanel>>) => {
    const emits = wrapper.emitted("update:modelValue") ?? [];
    return emits[emits.length - 1]?.[0];
};

// The grid's own hint paragraph, not the hidden live region PrimeVue puts inside a selected cell.
const hintText = (wrapper: Awaited<ReturnType<typeof mountPanel>>) => wrapper.find("p[aria-live='polite']").text();

describe("PeriodPanel", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("builds a range across a year change, in either click order (AC 4)", async () => {
        const wrapper = await mountPanel();

        await monthCell(wrapper, "Jul").trigger("click");
        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-07", to: "2026-07" });
        expect(wrapper.emitted("done")).toBeUndefined();
        expect(monthCell(wrapper, "Jul").classes()).toContain("outline-dashed");
        expect(hintText(wrapper)).toBe("Jul 2026 selected · tap another month to make a range");

        await clickYearPrev(wrapper);
        await monthCell(wrapper, "Mar").trigger("click");

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2025-03", to: "2026-07" });
        expect(wrapper.emitted("done")).toHaveLength(1);
    });

    it("keeps the panel open after the first click and completes a later month as a range", async () => {
        const wrapper = await mountPanel();

        await monthCell(wrapper, "Jul").trigger("click");
        expect(wrapper.emitted("done")).toBeUndefined();

        await monthCell(wrapper, "Sep").trigger("click");

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-07", to: "2026-09" });
        expect(wrapper.emitted("done")).toHaveLength(1);
    });

    it("commits a single month when the same month is clicked twice", async () => {
        const wrapper = await mountPanel();

        await monthCell(wrapper, "Jul").trigger("click");
        expect(wrapper.emitted("done")).toBeUndefined();

        await monthCell(wrapper, "Jul").trigger("click");

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-07", to: "2026-07" });
        expect(wrapper.emitted("done")).toHaveLength(1);
    });

    it("shows no pending ring and the idle hint before any grid click", async () => {
        const wrapper = await mountPanel({ layout: "stacked" });

        expect(wrapper.findAll(".p-datepicker-month.outline-dashed")).toHaveLength(0);
        expect(hintText(wrapper)).toBe("Tap a month, or two for a range");
    });

    it("uses the side-layout idle hint wording", async () => {
        const wrapper = await mountPanel({ layout: "side" });

        expect(hintText(wrapper)).toBe("Pick a month, or two for a range");
    });

    it("chooses a preset from the side list and commits it", async () => {
        const wrapper = await mountPanel({ layout: "side" });

        const option = wrapper.findAll('[role="option"]').find((element) => element.text().includes("Last 3 months"));
        if (!option) throw new Error("Last 3 months option not found");
        await option.trigger("click");

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-08", to: "2026-10" });
        expect(wrapper.emitted("done")).toHaveLength(1);
    });

    it("disables months after the current one and ignores clicks on them", async () => {
        const wrapper = await mountPanel();

        const november = monthCell(wrapper, "Nov");
        expect(november.classes()).toContain("p-disabled");

        await november.trigger("click");
        expect(wrapper.emitted("update:modelValue")).toBeUndefined();
        expect(wrapper.emitted("done")).toBeUndefined();
    });

    it("renders every side-layout preset without an inner scroll", async () => {
        const wrapper = await mountPanel({ layout: "side", presets: TRANSACTIONS_PRESETS });

        expect(wrapper.findAll('[role="option"]')).toHaveLength(TRANSACTIONS_PRESETS.length);
        const list = wrapper.find(".p-listbox-list-container");
        expect(list.attributes("style")).not.toContain("14rem");
        expect(list.attributes("style")).toContain("max-height: none");
    });

    it("shows an All time chip in the stacked layout and commits all time", async () => {
        const wrapper = await mountPanel({ layout: "stacked" });

        const chip = wrapper.findAll("button").find((element) => element.text().trim() === "All time");
        if (!chip) throw new Error("All time chip not found");
        await chip.trigger("click");

        expect(lastEmit(wrapper)).toEqual({ kind: "all" });
        expect(wrapper.emitted("done")).toHaveLength(1);
    });
});
