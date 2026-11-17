import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import StatusTag from "./StatusTag.vue";

describe("StatusTag", () => {
    it("renders a neutral tone as the PrimeVue secondary severity", async () => {
        const wrapper = await mountSuspended(StatusTag, { props: { value: "Select end month", tone: "neutral" } });

        expect(wrapper.classes()).toContain("p-tag");
        expect(wrapper.classes()).toContain("p-tag-secondary");
        expect(wrapper.text()).toContain("Select end month");
    });

    it("passes a success tone through to the PrimeVue severity", async () => {
        const wrapper = await mountSuspended(StatusTag, { props: { value: "Paid", tone: "success" } });

        expect(wrapper.classes()).toContain("p-tag-success");
    });

    it("renders the optional PrimeIcons icon before the value", async () => {
        const wrapper = await mountSuspended(StatusTag, {
            props: { value: "Hidden on Overview", icon: "pi pi-eye-slash" },
        });

        const icon = wrapper.find(".pi-eye-slash");
        expect(icon.exists()).toBe(true);
        expect(wrapper.text()).toContain("Hidden on Overview");
        // The icon element comes first, before the text, in the tag's DOM order.
        expect(wrapper.element.firstElementChild).toBe(icon.element);
    });

    it("renders no icon element when no icon is given", async () => {
        const wrapper = await mountSuspended(StatusTag, { props: { value: "Synced" } });

        expect(wrapper.find(".p-tag-icon").exists()).toBe(false);
        expect(wrapper.find("[class*='pi-']").exists()).toBe(false);
    });
});
