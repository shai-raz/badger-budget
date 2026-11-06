import { describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { h } from "vue";
import ScrollRow from "./ScrollRow.vue";

const mountRow = async (
    metrics: { scrollWidth: number; clientWidth: number },
    extraProps: { backdropClass?: string } = {},
) => {
    const wrapper = await mountSuspended(ScrollRow, {
        props: { label: "Transaction filters", ...extraProps },
        slots: { default: () => [h("button", "Account"), h("button", "Category")] },
        attachTo: document.body,
    });
    const track = wrapper.find(".scroll-row-track").element as HTMLElement;
    Object.defineProperty(track, "scrollWidth", { value: metrics.scrollWidth, configurable: true });
    Object.defineProperty(track, "clientWidth", { value: metrics.clientWidth, configurable: true });
    // The stubs land after mount, so a scroll event re-reads the edges as a real scroll would.
    track.dispatchEvent(new Event("scroll"));
    await wrapper.vm.$nextTick();
    return { wrapper, track };
};

describe("ScrollRow", () => {
    it("shows no arrows when the content fits", async () => {
        const { wrapper } = await mountRow({ scrollWidth: 400, clientWidth: 400 });

        expect(wrapper.find('[aria-label="Scroll right"]').exists()).toBe(false);
        expect(wrapper.find('[aria-label="Scroll left"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it("shows only the end arrow at the start of an overflowing row", async () => {
        const { wrapper } = await mountRow({ scrollWidth: 900, clientWidth: 400 });

        expect(wrapper.find('[aria-label="Scroll right"]').exists()).toBe(true);
        expect(wrapper.find('[aria-label="Scroll left"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it("backs each arrow with the surface the caller passes", async () => {
        const { wrapper } = await mountRow(
            { scrollWidth: 900, clientWidth: 400 },
            { backdropClass: "bg-surface-50 dark:bg-surface-950" },
        );

        const backing = wrapper.find('[aria-label="Scroll right"]').element.parentElement!;
        expect(backing.classList.contains("bg-surface-50")).toBe(true);
        expect(backing.classList.contains("dark:bg-surface-950")).toBe(true);
        expect(backing.classList.contains("bg-surface-0")).toBe(false);
        wrapper.unmount();
    });

    it("scrolls 80% of the visible width when an arrow is clicked", async () => {
        const { wrapper, track } = await mountRow({ scrollWidth: 900, clientWidth: 400 });
        const scrollBy = vi.fn();
        Object.defineProperty(track, "scrollBy", { value: scrollBy, configurable: true });

        await wrapper.find('[aria-label="Scroll right"]').trigger("click");

        expect(scrollBy).toHaveBeenCalledWith({ left: 320, behavior: "smooth" });
        wrapper.unmount();
    });

    it("turns a vertical wheel into a horizontal scroll on a scrollable row", async () => {
        const { wrapper, track } = await mountRow({ scrollWidth: 900, clientWidth: 400 });
        const scrollBy = vi.fn();
        Object.defineProperty(track, "scrollBy", { value: scrollBy, configurable: true });

        const event = new WheelEvent("wheel", { deltaY: 60, deltaX: 0, cancelable: true });
        track.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(scrollBy).toHaveBeenCalledWith({ left: 60 });
        wrapper.unmount();
    });

    it("lets the page scroll when the wheel turn has no room left in the row", async () => {
        const { wrapper, track } = await mountRow({ scrollWidth: 900, clientWidth: 400 });
        const scrollBy = vi.fn();
        Object.defineProperty(track, "scrollBy", { value: scrollBy, configurable: true });

        // At the start, scrolling back (negative deltaY) has nowhere to go.
        const event = new WheelEvent("wheel", { deltaY: -60, deltaX: 0, cancelable: true });
        track.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(scrollBy).not.toHaveBeenCalled();
        wrapper.unmount();
    });
});
