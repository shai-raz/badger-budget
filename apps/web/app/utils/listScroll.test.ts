import { describe, expect, it } from "vitest";
import { listScrollKey, saveListScroll, takeListScroll } from "./listScroll";

describe("listScroll", () => {
    it("returns the saved top when taken with the same key", () => {
        const key = listScrollKey({ page: 1, search: "rent" });
        saveListScroll(key, 840);
        expect(takeListScroll(key)).toBe(840);
    });

    it("returns null on a second take because the slot is cleared", () => {
        const key = listScrollKey({ search: "again" });
        saveListScroll(key, 300);
        takeListScroll(key);
        expect(takeListScroll(key)).toBeNull();
    });

    it("returns null for a different key and clears the slot", () => {
        const key = listScrollKey({ search: "a" });
        saveListScroll(key, 500);
        expect(takeListScroll(listScrollKey({ search: "b" }))).toBeNull();
        expect(takeListScroll(key)).toBeNull();
    });

    it("overwrites an earlier save", () => {
        const key = listScrollKey({ search: "overwrite" });
        saveListScroll(key, 100);
        saveListScroll(key, 900);
        expect(takeListScroll(key)).toBe(900);
    });

    it("builds the same key for equal params regardless of object identity", () => {
        expect(listScrollKey({ a: 1, b: "x" })).toBe(listScrollKey({ a: 1, b: "x" }));
        expect(listScrollKey({ a: 1 })).not.toBe(listScrollKey({ a: 2 }));
    });
});
