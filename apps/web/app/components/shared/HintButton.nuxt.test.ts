import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import HintButton from "./HintButton.vue";

describe("HintButton", () => {
    it("renders its icon and accessible name from props", async () => {
        const wrapper = await mountSuspended(HintButton, {
            props: { icon: "pi-lock", ariaLabel: "Locked: from your bank", tooltip: "From your bank" },
        });

        expect(wrapper.attributes("aria-label")).toBe("Locked: from your bank");
        expect(wrapper.find("i").classes()).toContain("pi-lock");
    });
});
