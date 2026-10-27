import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import SortMenu from "./SortMenu.vue";
import type { TransactionSortOption } from "../../composables/transactions/useTransactionFilters";

// Both containers teleport to <body>, so every mounted menu is unmounted after its test.
const mounted: { unmount: () => void }[] = [];

const mountSortMenu = async (props: { modelValue?: TransactionSortOption; compact?: boolean } = {}) => {
    const wrapper = await mountSuspended(SortMenu, { props });
    mounted.push(wrapper);
    return wrapper;
};

const trigger = (wrapper: Awaited<ReturnType<typeof mountSortMenu>>) => wrapper.find('[aria-haspopup="menu"]');

describe("SortMenu", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("shows the full prefixed label and no aria-label by default", async () => {
        const wrapper = await mountSortMenu({ modelValue: "newest" });

        expect(trigger(wrapper).text()).toContain("Sort · Newest");
        expect(trigger(wrapper).attributes("aria-label")).toBeUndefined();
    });

    it("drops the prefix when compact and names the trigger with the full sort label", async () => {
        const wrapper = await mountSortMenu({ modelValue: "newest", compact: true });

        expect(trigger(wrapper).text()).toContain("Newest");
        expect(trigger(wrapper).text()).not.toContain("Sort");
        expect(trigger(wrapper).attributes("aria-label")).toBe("Sort: Newest first");
    });

    it("shows the short value and the matching full label for a non-default sort when compact", async () => {
        const wrapper = await mountSortMenu({ modelValue: "amount-desc", compact: true });

        expect(trigger(wrapper).text()).toContain("Highest");
        expect(trigger(wrapper).text()).not.toContain("Sort");
        expect(trigger(wrapper).attributes("aria-label")).toBe("Sort: Highest amount");
    });
});
