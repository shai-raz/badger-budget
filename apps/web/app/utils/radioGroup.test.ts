import { describe, expect, it } from "vitest";
import { nextRadioIndex } from "./radioGroup";

describe("nextRadioIndex", () => {
    it("moves forward on ArrowRight and ArrowDown", () => {
        expect(nextRadioIndex(0, "ArrowRight", 3)).toBe(1);
        expect(nextRadioIndex(1, "ArrowDown", 3)).toBe(2);
    });

    it("moves backward on ArrowLeft and ArrowUp", () => {
        expect(nextRadioIndex(2, "ArrowLeft", 3)).toBe(1);
        expect(nextRadioIndex(1, "ArrowUp", 3)).toBe(0);
    });

    it("wraps forward from the last radio to the first", () => {
        expect(nextRadioIndex(2, "ArrowRight", 3)).toBe(0);
        expect(nextRadioIndex(2, "ArrowDown", 3)).toBe(0);
    });

    it("wraps backward from the first radio to the last", () => {
        expect(nextRadioIndex(0, "ArrowLeft", 3)).toBe(2);
        expect(nextRadioIndex(0, "ArrowUp", 3)).toBe(2);
    });

    it("jumps to the first radio on Home and the last on End", () => {
        expect(nextRadioIndex(1, "Home", 3)).toBe(0);
        expect(nextRadioIndex(0, "End", 3)).toBe(2);
    });

    it("returns null for any other key", () => {
        expect(nextRadioIndex(1, "Enter", 3)).toBeNull();
        expect(nextRadioIndex(1, " ", 3)).toBeNull();
        expect(nextRadioIndex(1, "Tab", 3)).toBeNull();
    });

    it("returns null when the group has no radios", () => {
        expect(nextRadioIndex(0, "ArrowRight", 0)).toBeNull();
        expect(nextRadioIndex(0, "Home", 0)).toBeNull();
    });

    it("stays on the only radio in a group of one", () => {
        expect(nextRadioIndex(0, "ArrowRight", 1)).toBe(0);
        expect(nextRadioIndex(0, "ArrowLeft", 1)).toBe(0);
    });
});
