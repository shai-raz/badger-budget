import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { h } from "vue";
import SectionBand from "./SectionBand.vue";

describe("SectionBand", () => {
    it("renders the title as the heading", async () => {
        const wrapper = await mountSuspended(SectionBand, { props: { title: "Accounts" } });

        expect(wrapper.find("h2").text()).toContain("Accounts");
    });

    it("renders no heading and still shows the default slot when there is no title, meta, link or label", async () => {
        const wrapper = await mountSuspended(SectionBand, {
            slots: { default: () => h("p", "Body text") },
        });

        expect(wrapper.find("h2").exists()).toBe(false);
        expect(wrapper.text()).toContain("Body text");
    });

    it("keeps a meta line in the header row when there is no title", async () => {
        const wrapper = await mountSuspended(SectionBand, { props: { meta: "3 active" } });

        expect(wrapper.find("h2").exists()).toBe(false);
        expect(wrapper.text()).toContain("3 active");
    });

    it("shows the generic error text when there is no title", async () => {
        const wrapper = await mountSuspended(SectionBand, { props: { error: new Error("boom") } });

        expect(wrapper.text()).toContain("Couldn't load this section.");
    });

    it("names the section in the error text when there is a title", async () => {
        const wrapper = await mountSuspended(SectionBand, { props: { title: "Accounts", error: new Error("boom") } });

        expect(wrapper.text()).toContain("Couldn't load accounts.");
    });
});
