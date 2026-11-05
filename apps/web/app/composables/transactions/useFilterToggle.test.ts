import { describe, expect, it } from "vitest";
import { computed, nextTick, ref } from "vue";

import { useFilterToggle } from "./useFilterToggle";

const OPTIONS = ["a", "b", "c", "d"].map((value) => ({ value }));

function setup(initial: string[] = [], options = OPTIONS) {
    const selected = ref<string[]>(initial);
    return { selected, ...useFilterToggle(selected, options) };
}

describe("useFilterToggle", () => {
    it("adds and removes values, keeping the selection in option order", () => {
        const { selected, toggle, selectedValues } = setup();

        toggle("c");
        toggle("a");
        expect(selected.value).toEqual(["a", "c"]);
        expect(selectedValues.value).toEqual(["a", "c"]);

        toggle("a");
        expect(selected.value).toEqual(["c"]);
    });

    it("collapses to the empty 'all' selection when every option is selected", () => {
        const { selected, toggle, isAllActive } = setup(["a", "b", "c"]);

        toggle("d");

        expect(selected.value).toEqual([]);
        expect(isAllActive.value).toBe(true);
    });

    it("returns to 'all' when the last selected value is removed", () => {
        const { selected, toggle, isAllActive } = setup(["b"]);

        toggle("b");

        expect(selected.value).toEqual([]);
        expect(isAllActive.value).toBe(true);
    });

    it("selectAll clears the selection back to 'all'", () => {
        const { selected, selectAll, isAllActive } = setup(["a", "b"]);

        selectAll();

        expect(selected.value).toEqual([]);
        expect(isAllActive.value).toBe(true);
    });

    it("invert selects exactly the offered unselected values, and a second invert restores the original", () => {
        const { selected, invert, canInvert } = setup(["a", "c"]);

        expect(canInvert.value).toBe(true);
        invert();
        expect(selected.value).toEqual(["b", "d"]);

        invert();
        expect(selected.value).toEqual(["a", "c"]);
    });

    it("invert is a no-op when nothing is selected or only one option is offered", () => {
        const none = setup([]);
        expect(none.canInvert.value).toBe(false);
        none.invert();
        expect(none.selected.value).toEqual([]);

        const single = setup(["a"], [{ value: "a" }]);
        expect(single.canInvert.value).toBe(false);
        single.invert();
        expect(single.selected.value).toEqual(["a"]);
    });

    it("prunes a stale selected id that is no longer an option on the next change", () => {
        const { selected, toggle, selectedValues } = setup(["a", "zzz"]);

        expect(selectedValues.value).toEqual(["a"]);

        toggle("b");

        expect(selected.value).toEqual(["a", "b"]);
    });

    it("does not let a stale id stop a full selection from collapsing to 'all'", () => {
        const { selected, toggle } = setup(["a", "b", "c", "zzz"]);

        toggle("d");

        expect(selected.value).toEqual([]);
    });

    it("lands two toggles made in the same tick before the parent re-renders", async () => {
        // The parent's model only catches up on render, so the getter lags behind the setter until the next tick.
        const rendered = ref<string[]>([]);
        const written: string[][] = [];
        const model = computed<string[]>({
            get: () => rendered.value,
            set: (ids) => {
                written.push(ids);
            },
        });
        const { toggle } = useFilterToggle(model, OPTIONS);

        toggle("a");
        toggle("b");

        expect(written).toEqual([["a"], ["a", "b"]]);

        await nextTick();
        rendered.value = written.at(-1) ?? [];
        toggle("c");

        expect(written.at(-1)).toEqual(["a", "b", "c"]);
    });
});
