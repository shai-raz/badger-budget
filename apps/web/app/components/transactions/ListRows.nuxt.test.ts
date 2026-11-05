import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { h } from "vue";
import ListRows from "./ListRows.vue";

// The list teleports its action menu to <body>, so every mounted list is unmounted after its test.
const mounted: { unmount: () => void }[] = [];

const mountListRows = async (total: number) => {
    const wrapper = await mountSuspended(ListRows, {
        props: { transactions: [], hasMore: false, isLoadingMore: false, total },
        slots: { "header-actions": () => h("span", { class: "sort-stub" }, "Sort · Newest") },
    });
    mounted.push(wrapper);
    return wrapper;
};

describe("ListRows header", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("shows the singular count for one transaction", async () => {
        const wrapper = await mountListRows(1);

        expect(wrapper.text()).toContain("1 transaction");
        expect(wrapper.text()).not.toContain("1 transactions");
    });

    it("shows the plural count for many transactions", async () => {
        const wrapper = await mountListRows(3);

        expect(wrapper.text()).toContain("3 transactions");
    });

    it("renders the header-actions slot beside the count", async () => {
        const wrapper = await mountListRows(3);

        expect(wrapper.find(".sort-stub").text()).toBe("Sort · Newest");
    });
});
