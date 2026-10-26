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
});
