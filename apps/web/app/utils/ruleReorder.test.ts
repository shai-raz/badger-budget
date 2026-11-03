import { describe, expect, it } from "vitest";
import { canMoveDown, canMoveUp, keyboardReorder, moveItem, sameOrder, type KeyboardReorderState } from "./ruleReorder";

const idle = (ids: string[]): KeyboardReorderState => ({ ids, picked: null, original: null });

describe("moveItem", () => {
    it("moves an item up and down without mutating the input", () => {
        const items = ["a", "b", "c", "d"];
        expect(moveItem(items, 2, 0)).toEqual(["c", "a", "b", "d"]);
        expect(moveItem(items, 0, 3)).toEqual(["b", "c", "d", "a"]);
        expect(items).toEqual(["a", "b", "c", "d"]);
    });

    it("returns a copy when from and to are equal or out of range", () => {
        const items = ["a", "b"];
        expect(moveItem(items, 1, 1)).toEqual(["a", "b"]);
        expect(moveItem(items, -1, 0)).toEqual(["a", "b"]);
        expect(moveItem(items, 0, 2)).toEqual(["a", "b"]);
    });
});

describe("sameOrder", () => {
    it("compares ids position by position", () => {
        expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
        expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
        expect(sameOrder(["a"], ["a", "b"])).toBe(false);
        expect(sameOrder([], [])).toBe(true);
    });
});

describe("canMoveUp and canMoveDown", () => {
    it("blocks moving past the ends", () => {
        expect(canMoveUp(0)).toBe(false);
        expect(canMoveUp(1)).toBe(true);
        expect(canMoveDown(2, 3)).toBe(false);
        expect(canMoveDown(1, 3)).toBe(true);
    });
});

describe("keyboardReorder", () => {
    it("picks the focused row on Space without changing the order", () => {
        expect(keyboardReorder(idle(["a", "b", "c"]), "Space", 1)).toEqual({
            state: { ids: ["a", "b", "c"], picked: 1, original: ["a", "b", "c"] },
            commit: null,
        });
    });

    it("moves the picked row with the arrows and clamps at the ends", () => {
        let result = keyboardReorder(idle(["a", "b", "c"]), "Space", 0);
        result = keyboardReorder(result.state, "ArrowDown", 0);
        expect(result.state).toEqual({ ids: ["b", "a", "c"], picked: 1, original: ["a", "b", "c"] });
        result = keyboardReorder(result.state, "ArrowDown", 0);
        result = keyboardReorder(result.state, "ArrowDown", 0);
        expect(result.state.ids).toEqual(["b", "c", "a"]);
        expect(result.state.picked).toBe(2);
        result = keyboardReorder(result.state, "ArrowUp", 0);
        result = keyboardReorder(result.state, "ArrowUp", 0);
        result = keyboardReorder(result.state, "ArrowUp", 0);
        expect(result.state.ids).toEqual(["a", "b", "c"]);
        expect(result.state.picked).toBe(0);
    });

    it("ignores arrows when nothing is picked", () => {
        const state = idle(["a", "b"]);
        expect(keyboardReorder(state, "ArrowDown", 0)).toEqual({ state, commit: null });
    });

    it("commits the new order when Space drops a moved row", () => {
        let result = keyboardReorder(idle(["a", "b", "c"]), "Space", 0);
        result = keyboardReorder(result.state, "ArrowDown", 0);
        result = keyboardReorder(result.state, "Space", 0);
        expect(result.commit).toEqual(["b", "a", "c"]);
        expect(result.state).toEqual({ ids: ["b", "a", "c"], picked: null, original: null });
    });

    it("commits nothing when Space drops a row where it started", () => {
        let result = keyboardReorder(idle(["a", "b"]), "Space", 0);
        result = keyboardReorder(result.state, "ArrowDown", 0);
        result = keyboardReorder(result.state, "ArrowUp", 0);
        result = keyboardReorder(result.state, "Space", 0);
        expect(result.commit).toBeNull();
        expect(result.state.picked).toBeNull();
    });

    it("restores the original order and clears the pick on Escape", () => {
        let result = keyboardReorder(idle(["a", "b", "c"]), "Space", 0);
        result = keyboardReorder(result.state, "ArrowDown", 0);
        result = keyboardReorder(result.state, "ArrowDown", 0);
        expect(keyboardReorder(result.state, "Escape", 0)).toEqual({
            state: { ids: ["a", "b", "c"], picked: null, original: null },
            commit: null,
        });
    });

    it("does nothing on Escape when nothing is picked", () => {
        const state = idle(["a", "b"]);
        expect(keyboardReorder(state, "Escape", 0)).toEqual({ state, commit: null });
    });
});
