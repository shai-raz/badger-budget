import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import { h } from "vue";
import BottomSheet from "./BottomSheet.vue";

const mounted: VueWrapper[] = [];

// The Drawer teleports to <body>, so the sheet is read from the document.
const mountSheet = async (props: { hideTitle?: boolean } = {}) => {
    const wrapper = await mountSuspended(BottomSheet, {
        props: { title: "Period", visible: true, ...props },
        slots: {
            actions: () => h("button", "Clear"),
            default: () => h("p", "Body text"),
            footer: () => h("button", "Show results"),
        },
        // The real Transition would keep the Drawer mounted through its leave animation.
        global: { stubs: { transition: false } },
    });
    mounted.push(wrapper);
    return wrapper;
};

const sheet = () => document.body.querySelector<HTMLElement>("[data-bottom-sheet]");

describe("BottomSheet", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("renders the title, actions, body and footer when visible", async () => {
        await mountSheet();

        const text = sheet()?.textContent ?? "";
        expect(text).toContain("Period");
        expect(text).toContain("Clear");
        expect(text).toContain("Body text");
        expect(text).toContain("Show results");
    });

    it("names the dialog with the title", async () => {
        await mountSheet();

        expect(sheet()?.getAttribute("aria-label")).toBe("Period");
    });

    it("hides the visible title with hideTitle but keeps the accessible name and body", async () => {
        await mountSheet({ hideTitle: true });

        expect(sheet()?.getAttribute("aria-label")).toBe("Period");
        expect(sheet()?.textContent).not.toContain("Period");
        expect(sheet()?.textContent).toContain("Body text");
    });

    it("unmounts the sheet when visible is set to false", async () => {
        const wrapper = await mountSheet();
        expect(sheet()).not.toBeNull();

        await wrapper.setProps({ visible: false });

        await vi.waitFor(() => expect(sheet()).toBeNull());
    });
});
