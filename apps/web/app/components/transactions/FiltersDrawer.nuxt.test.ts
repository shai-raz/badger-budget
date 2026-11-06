import { afterEach, describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import FiltersDrawer from "./FiltersDrawer.vue";
import type { FilterOption } from "~/utils/filterOptions";

const accountOptions: FilterOption[] = [
    {
        value: "a1",
        label: "Checking",
        avatar: { kind: "entity", icon: null, color: "#3b82f6", fallback: "tag" },
        count: 4,
        stale: false,
    },
];

const mounted: VueWrapper[] = [];

// The drawer teleports to <body>, so its sections are read from the document.
const drawerHeaders = () => Array.from(document.body.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"));

const mountDrawer = async (visible: boolean) => {
    const wrapper = await mountSuspended(FiltersDrawer, {
        props: {
            visible,
            typeOptions: [],
            accountOptions,
            categoryOptions: [],
            activeFilterCount: 1,
            selectedTypes: [],
            selectedAccountIds: [],
            selectedCategoryIds: [],
            showHidden: false,
        },
    });
    mounted.push(wrapper);
    return wrapper;
};

describe("TransactionsFiltersDrawer", () => {
    afterEach(() => {
        mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    });

    it("renders its sections expanded when visible", async () => {
        await mountDrawer(true);

        expect(drawerHeaders().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "true", "true"]);
    });

    it("titles the drawer Filters", async () => {
        await mountDrawer(true);

        expect(document.body.textContent).toContain("Filters");
    });

    it("renders no sections while hidden", async () => {
        await mountDrawer(false);

        expect(drawerHeaders()).toHaveLength(0);
    });
});
