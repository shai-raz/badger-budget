import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import type { VueWrapper } from "@vue/test-utils";
import Skeleton from "primevue/skeleton";
import UnmatchedImportRow from "./UnmatchedImportRow.vue";

const layout = vi.hoisted(() => ({ desktop: true }));

mockNuxtImport("useIsDesktop", () => () => ref(layout.desktop));

const mountRow = (props: Record<string, unknown> = {}) =>
    mountSuspended(UnmatchedImportRow, { props: { mode: "reuse_only", ...props } });

const changeButton = (wrapper: VueWrapper) =>
    wrapper.findAll("button").find((button) => button.text().trim() === "Change");

beforeEach(() => {
    layout.desktop = true;
});

describe("UnmatchedImportRow on desktop", () => {
    it("shows the label, the mode, the hint and a Change button", async () => {
        const wrapper = await mountRow();

        expect(wrapper.text()).toContain("When no rule matches");
        expect(wrapper.text()).toContain("Bank's category, if it exists");
        expect(wrapper.text()).toContain("Use the bank's category only when you already have one with that name.");
        expect(changeButton(wrapper)).toBeDefined();
    });

    it("emits open from the Change button", async () => {
        const wrapper = await mountRow();

        await changeButton(wrapper)!.trigger("click");

        expect(wrapper.emitted("open")).toHaveLength(1);
    });

    it("disables Change and shows the demo note for the demo account", async () => {
        const wrapper = await mountRow({ disabled: true });

        expect(wrapper.text()).toContain("Bank's category, if it exists");
        expect(wrapper.text()).toContain("The demo account can't change this.");
        expect(changeButton(wrapper)!.attributes("disabled")).toBeDefined();
    });

    it("shows a skeleton in place of the mode while loading", async () => {
        const wrapper = await mountRow({ loading: true });

        expect(wrapper.findComponent(Skeleton).exists()).toBe(true);
        expect(wrapper.text()).not.toContain("Bank's category, if it exists");
    });

    it("shows the error note and disables Change when the setting did not load", async () => {
        const wrapper = await mountRow({ error: new Error("network") });

        expect(wrapper.text()).toContain("Couldn't load this setting.");
        expect(changeButton(wrapper)!.attributes("disabled")).toBeDefined();
    });
});

describe("UnmatchedImportRow on mobile", () => {
    beforeEach(() => {
        layout.desktop = false;
    });

    it("renders one button with the chevron and no Change button", async () => {
        const wrapper = await mountRow();

        const button = wrapper.get("button");
        expect(wrapper.findAll("button")).toHaveLength(1);
        expect(button.find(".pi-chevron-right").exists()).toBe(true);
        expect(changeButton(wrapper)).toBeUndefined();
        expect(button.attributes("aria-label")).toBeUndefined();
        expect(button.text()).toContain("When no rule matches");
        expect(button.text()).toContain("Bank's category, if it exists");
        expect(button.text()).toContain("Change");
    });

    it("keeps the demo note in the button's accessible name", async () => {
        const wrapper = await mountRow({ disabled: true });

        expect(wrapper.get("button").text()).toContain("The demo account can't change this.");
    });

    it("keeps the error note in the button's accessible name", async () => {
        const wrapper = await mountRow({ error: new Error("network") });

        expect(wrapper.get("button").text()).toContain("Couldn't load this setting.");
    });

    it("names the button without a mode while loading", async () => {
        const wrapper = await mountRow({ loading: true });

        expect(wrapper.get("button").text()).toContain("When no rule matches");
        expect(wrapper.get("button").text()).toContain("Change");
        expect(wrapper.get("button").attributes("aria-label")).toBeUndefined();
    });

    it("emits open when the row is tapped", async () => {
        const wrapper = await mountRow();

        await wrapper.get("button").trigger("click");

        expect(wrapper.emitted("open")).toHaveLength(1);
    });

    it("is disabled for the demo account and while loading", async () => {
        const demo = await mountRow({ disabled: true });
        expect(demo.get("button").attributes("disabled")).toBeDefined();

        const loading = await mountRow({ loading: true });
        expect(loading.get("button").attributes("disabled")).toBeDefined();
        expect(loading.findComponent(Skeleton).exists()).toBe(true);
    });
});
