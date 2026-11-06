import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { nextTick, ref } from "vue";
import PeriodPicker from "./PeriodPicker.vue";
import { TRANSACTIONS_PRESETS, type PeriodSelection } from "~/utils/monthRange";

// Oct 26 2026: the current month is Oct 2026.
const NOW = new Date(2026, 9, 26);

// Toggled per test to cover the md+ and below-md layouts.
const layout = vi.hoisted(() => ({ desktop: true }));

mockNuxtImport("useIsDesktop", () => () => ref(layout.desktop));

// Both containers teleport to <body>, so every mounted picker is unmounted after its test to keep those queries isolated.
const mounted: { unmount: () => void }[] = [];

// The real Transition runs here: the Popover emits show and hide from its enter and leave hooks.
// Focus only moves to elements in the document, so a test about focus mounts the picker attached to it.
const mountPicker = async (modelValue: PeriodSelection, resettable = false, attach = false) => {
    const wrapper = await mountSuspended(PeriodPicker, {
        props: { modelValue, presets: TRANSACTIONS_PRESETS, resettable },
        attachTo: attach ? document.body : undefined,
        global: { stubs: { transition: false } },
    });
    mounted.push(wrapper);
    return wrapper;
};

type Wrapper = Awaited<ReturnType<typeof mountPicker>>;

const labelButton = (wrapper: Wrapper) => wrapper.find('[aria-haspopup="dialog"]');
const prevButton = (wrapper: Wrapper) => wrapper.find('[aria-label="Previous period"]');
const nextButton = (wrapper: Wrapper) => wrapper.find('[aria-label="Next period"]');
const thisMonthButton = (wrapper: Wrapper) =>
    wrapper.findAll("button").find((button) => button.text() === "This month");
const resetButton = (wrapper: Wrapper) => wrapper.find('[aria-label="Back to this month"]');

const lastEmit = (wrapper: Wrapper) => {
    const emits = wrapper.emitted("update:modelValue") ?? [];
    return emits[emits.length - 1]?.[0];
};

const bodyElement = (selector: string) => document.body.querySelector(selector);

const findBodyButton = (label: string) =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === label,
    );

const findBodyOption = (label: string) =>
    Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find((option) =>
        option.textContent?.includes(label),
    );

const findBodyMonthCell = (label: string) =>
    Array.from(document.body.querySelectorAll<HTMLElement>(".p-datepicker-month")).find(
        (cell) => cell.textContent?.trim().split(/\s+/)[0] === label,
    );

// A real press starts with mousedown, which the popover uses to mark the click as its own (selfClick); a bare
// click would look like an outside click and close it.
const pressBodyMonthCell = (label: string) => {
    const cell = findBodyMonthCell(label);
    if (!cell) throw new Error(`Month cell not found: ${label}`);
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    cell.click();
};

describe("PeriodPicker", () => {
    beforeEach(() => {
        layout.desktop = true;
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
        vi.useRealTimers();
    });

    it("labels a single month and hides This month when it is the current month", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        expect(wrapper.find(".p-buttongroup").classes()).toContain("min-w-0");
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

    it("opens only the popover at md+, and choosing a preset closes it", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        await labelButton(wrapper).trigger("click");
        await nextTick();

        expect(bodyElement(".p-popover")).not.toBeNull();
        expect(bodyElement("[data-period-sheet]")).toBeNull();
        expect(labelButton(wrapper).attributes("aria-expanded")).toBe("true");

        findBodyOption("Last 3 months")?.click();
        await nextTick();

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-08", to: "2026-10" });
        expect(labelButton(wrapper).attributes("aria-expanded")).toBe("false");
        await vi.waitFor(() => expect(bodyElement(".p-popover")).toBeNull());
    });

    it("closes the popover once a month range is finished in the grid", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        await labelButton(wrapper).trigger("click");
        await nextTick();

        pressBodyMonthCell("Aug");
        await nextTick();

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-08", to: "2026-08" });
        expect(bodyElement(".p-popover")).not.toBeNull();
        expect(labelButton(wrapper).attributes("aria-expanded")).toBe("true");

        pressBodyMonthCell("Sep");
        await nextTick();

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-08", to: "2026-09" });
        expect(labelButton(wrapper).attributes("aria-expanded")).toBe("false");
        await vi.waitFor(() => expect(bodyElement(".p-popover")).toBeNull());
    });

    it("closes the popover when the same month is pressed twice", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        await labelButton(wrapper).trigger("click");
        await nextTick();

        pressBodyMonthCell("Oct");
        await nextTick();
        expect(bodyElement(".p-popover")).not.toBeNull();

        pressBodyMonthCell("Oct");
        await nextTick();

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-10", to: "2026-10" });
        await vi.waitFor(() => expect(bodyElement(".p-popover")).toBeNull());
    });

    it("keeps the first pick on Escape and reopens to the idle hint", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        await labelButton(wrapper).trigger("click");
        await nextTick();

        pressBodyMonthCell("Aug");
        await nextTick();

        document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
        await nextTick();

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-08", to: "2026-08" });
        await vi.waitFor(() => expect(bodyElement(".p-popover")).toBeNull());
        expect(labelButton(wrapper).attributes("aria-expanded")).toBe("false");

        await labelButton(wrapper).trigger("click");
        await nextTick();

        expect(bodyElement("p[aria-live='polite']")?.textContent?.trim()).toBe("Pick a month, or two for a range");
        expect(document.body.querySelectorAll(".p-datepicker-month.outline-dashed")).toHaveLength(0);
    });

    it("keeps the first pick on an outside click and closes", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        await labelButton(wrapper).trigger("click");
        await nextTick();

        pressBodyMonthCell("Aug");
        await nextTick();

        document.body.click();
        await nextTick();

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-08", to: "2026-08" });
        await vi.waitFor(() => expect(bodyElement(".p-popover")).toBeNull());
    });

    it("keeps the bottom sheet open after the first tap and closes on the second", async () => {
        layout.desktop = false;
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        await labelButton(wrapper).trigger("click");
        await nextTick();

        pressBodyMonthCell("Aug");
        await nextTick();

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-08", to: "2026-08" });
        expect(bodyElement("[data-period-sheet]")).not.toBeNull();
        expect(labelButton(wrapper).attributes("aria-expanded")).toBe("true");

        pressBodyMonthCell("Sep");
        await nextTick();

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-08", to: "2026-09" });
        expect(labelButton(wrapper).attributes("aria-expanded")).toBe("false");
        await vi.waitFor(() => expect(bodyElement("[data-period-sheet]")).toBeNull());
    });

    it("opens only the bottom sheet below md, and choosing a preset closes it", async () => {
        layout.desktop = false;
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" });

        await labelButton(wrapper).trigger("click");
        await nextTick();

        expect(bodyElement("[data-period-sheet]")).not.toBeNull();
        expect(bodyElement(".p-popover")).toBeNull();
        expect(labelButton(wrapper).attributes("aria-expanded")).toBe("true");

        findBodyButton("Last 3 months")?.click();
        await nextTick();

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-08", to: "2026-10" });
        expect(labelButton(wrapper).attributes("aria-expanded")).toBe("false");
    });

    it("keeps the outlined group and no × off the current month when not resettable", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-09", to: "2026-09" });

        expect(labelButton(wrapper).classes()).toContain("p-button-outlined");
        expect(prevButton(wrapper).classes()).toContain("p-button-outlined");
        expect(nextButton(wrapper).classes()).toContain("p-button-outlined");
        expect(resetButton(wrapper).exists()).toBe(false);
    });

    it("fills the group and offers a × back to this month when resettable off the current month", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-09", to: "2026-09" }, true);

        expect(labelButton(wrapper).classes()).not.toContain("p-button-outlined");
        expect(prevButton(wrapper).classes()).not.toContain("p-button-outlined");
        expect(nextButton(wrapper).classes()).not.toContain("p-button-outlined");
        expect(thisMonthButton(wrapper)).toBeUndefined();
        expect(resetButton(wrapper).exists()).toBe(true);
    });

    it("sets the current month when the × is clicked on a resettable picker", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-08", to: "2026-09" }, true);

        await resetButton(wrapper).trigger("click");

        expect(lastEmit(wrapper)).toEqual({ kind: "range", from: "2026-10", to: "2026-10" });
    });

    it("keeps focus on the label when the × is activated from the keyboard", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-08", to: "2026-09" }, true, true);
        const labelEl = labelButton(wrapper).element;
        const resetEl = resetButton(wrapper).element as HTMLElement;

        // Focus the × first, as a Tab would, so clearing it has to move focus rather than leave it on a dropped node.
        resetEl.focus();
        await resetButton(wrapper).trigger("click");
        await nextTick();

        expect(document.activeElement).toBe(labelEl);
    });

    it("keeps the × and the arrows at the 36px height below md when resettable", async () => {
        layout.desktop = false;
        const wrapper = await mountPicker({ kind: "range", from: "2026-09", to: "2026-09" }, true);

        expect(resetButton(wrapper).classes()).toContain("h-9");
        expect(labelButton(wrapper).classes()).toContain("h-9");
        expect(prevButton(wrapper).classes()).toContain("h-9");
        expect(nextButton(wrapper).classes()).toContain("h-9");
    });

    it("keeps the 32px picker below md when not resettable", async () => {
        layout.desktop = false;
        const wrapper = await mountPicker({ kind: "range", from: "2026-09", to: "2026-09" });

        expect(labelButton(wrapper).classes()).toContain("h-8");
        expect(prevButton(wrapper).classes()).toContain("h-8");
        expect(nextButton(wrapper).classes()).toContain("h-8");
    });

    it("keeps the disabled next arrow outlined and dimmed on the current month when resettable", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" }, true);

        expect(nextButton(wrapper).classes()).not.toContain("disabled:opacity-100");
        expect(nextButton(wrapper).find(".p-button-icon").classes()).not.toContain("opacity-40");
    });

    it("shows both disabled arrows in the on colour at 40% when resettable on all time", async () => {
        const wrapper = await mountPicker({ kind: "all" }, true);

        for (const button of [prevButton(wrapper), nextButton(wrapper)]) {
            expect(button.classes()).toContain("disabled:opacity-100");
            expect(button.find(".p-button-icon").classes()).toContain("opacity-40");
        }
    });

    it("leaves an enabled arrow on a past single month at full opacity", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-09", to: "2026-09" }, true);

        expect(nextButton(wrapper).attributes("disabled")).toBeUndefined();
        expect(nextButton(wrapper).find(".p-button-icon").classes()).not.toContain("opacity-40");
    });

    it("keeps the outlined secondary group and no × on the current month when resettable", async () => {
        const wrapper = await mountPicker({ kind: "range", from: "2026-10", to: "2026-10" }, true);

        expect(labelButton(wrapper).classes()).toContain("p-button-outlined");
        expect(labelButton(wrapper).classes()).toContain("p-button-secondary");
        expect(prevButton(wrapper).classes()).toContain("p-button-outlined");
        expect(nextButton(wrapper).classes()).toContain("p-button-outlined");
        expect(resetButton(wrapper).exists()).toBe(false);
        expect(thisMonthButton(wrapper)).toBeUndefined();
    });
});
