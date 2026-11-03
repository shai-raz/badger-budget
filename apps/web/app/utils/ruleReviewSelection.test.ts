import { describe, expect, it } from "vitest";
import {
    headerState,
    isSelected,
    selectAll,
    selectedCount,
    toApplySelection,
    toggleAll,
    toggleRow,
    type RuleSelection,
} from "./ruleReviewSelection";

const only = (...ids: string[]): RuleSelection => ({ mode: "only", ids: new Set(ids) });
const allExcept = (...ids: string[]): RuleSelection => ({ mode: "allExcept", ids: new Set(ids) });

describe("selectAll", () => {
    it("selects every row through allExcept with no exceptions", () => {
        const selection = selectAll();
        expect(selection.mode).toBe("allExcept");
        expect(selection.ids.size).toBe(0);
        expect(isSelected(selection, "any-row-not-loaded")).toBe(true);
    });
});

describe("isSelected", () => {
    it("treats ids as exceptions under allExcept", () => {
        expect(isSelected(allExcept("a"), "a")).toBe(false);
        expect(isSelected(allExcept("a"), "b")).toBe(true);
    });

    it("treats ids as picks under only", () => {
        expect(isSelected(only("a"), "a")).toBe(true);
        expect(isSelected(only("a"), "b")).toBe(false);
    });
});

describe("toggleRow", () => {
    it("unticks and reticks a row under allExcept", () => {
        const unticked = toggleRow(selectAll(), "a");
        expect(isSelected(unticked, "a")).toBe(false);
        expect(isSelected(toggleRow(unticked, "a"), "a")).toBe(true);
    });

    it("picks and unpicks a row under only", () => {
        const picked = toggleRow(only(), "a");
        expect(isSelected(picked, "a")).toBe(true);
        expect(isSelected(toggleRow(picked, "a"), "a")).toBe(false);
    });

    it("does not mutate the input selection", () => {
        const input = allExcept("a");
        toggleRow(input, "b");
        expect([...input.ids]).toEqual(["a"]);
    });
});

describe("selectedCount", () => {
    it("is the total minus the exceptions under allExcept", () => {
        expect(selectedCount(allExcept("a", "b"), 10)).toBe(8);
    });

    it("is the number of picks under only", () => {
        expect(selectedCount(only("a", "b"), 10)).toBe(2);
    });

    it("never goes below zero under allExcept", () => {
        expect(selectedCount(allExcept("a", "b", "c"), 2)).toBe(0);
    });
});

describe("headerState", () => {
    it("is all when every would-change row is selected", () => {
        expect(headerState(selectAll(), 5)).toBe("all");
    });

    it("is none when nothing is selected", () => {
        expect(headerState(only(), 5)).toBe("none");
        expect(headerState(allExcept("a", "b", "c", "d", "e"), 5)).toBe("none");
    });

    it("is some for a partial selection", () => {
        expect(headerState(allExcept("a"), 5)).toBe("some");
        expect(headerState(only("a"), 5)).toBe("some");
    });

    it("is none for an empty list", () => {
        expect(headerState(selectAll(), 0)).toBe("none");
    });
});

describe("toggleAll", () => {
    it("clears an all-selected list to only with no ids", () => {
        const cleared = toggleAll(selectAll(), 5);
        expect(cleared).toEqual({ mode: "only", ids: new Set() });
        expect(headerState(cleared, 5)).toBe("none");
    });

    it("selects everything from none", () => {
        expect(toggleAll(only(), 5)).toEqual(selectAll());
    });

    it("selects everything from some", () => {
        expect(toggleAll(only("a"), 5)).toEqual(selectAll());
        expect(toggleAll(allExcept("a"), 5)).toEqual(selectAll());
    });

    it("covers unloaded rows: untick all then tick a few gives only", () => {
        const unticked = toggleAll(selectAll(), 500);
        const picked = toggleRow(unticked, "row-37");
        expect(picked.mode).toBe("only");
        expect(selectedCount(picked, 500)).toBe(1);
    });
});

describe("toApplySelection", () => {
    it("sends the mode and ids as an array", () => {
        expect(toApplySelection(allExcept("a", "b"))).toEqual({ mode: "allExcept", ids: ["a", "b"] });
        expect(toApplySelection(only("c"))).toEqual({ mode: "only", ids: ["c"] });
    });
});
