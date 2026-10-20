import { describe, expect, it, vi } from "vitest";
import {
    createOptionName,
    NEW_CATEGORY_PALETTE,
    pickNewCategoryColor,
    saveWithPendingCategory,
} from "./pendingCategory";

describe("createOptionName", () => {
    it("returns null for empty input", () => {
        expect(createOptionName("", ["Food"])).toBeNull();
        expect(createOptionName("  ", ["Food"])).toBeNull();
        expect(createOptionName(null, [])).toBeNull();
        expect(createOptionName(undefined, [])).toBeNull();
    });
    it("returns null on case-insensitive exact match", () => {
        expect(createOptionName("Food", ["food"])).toBeNull();
    });
    it("returns trimmed name otherwise", () => {
        expect(createOptionName(" Coffee ", ["Food"])).toBe("Coffee");
        expect(createOptionName("Foo", ["Food"])).toBe("Foo");
    });
});

describe("saveWithPendingCategory", () => {
    it("skips creation without pending", async () => {
        const createCategory = vi.fn();
        const save = vi.fn().mockResolvedValue("ok");
        const r = await saveWithPendingCategory({ pending: null, createCategory, onCategoryCreated: vi.fn(), save });
        expect(r).toBe("ok");
        expect(createCategory).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledWith(null);
    });
    it("creates, adopts id, then saves in order", async () => {
        const calls: string[] = [];
        const createCategory = vi.fn(async () => (calls.push("create"), { id: "c1" }));
        const onCategoryCreated = vi.fn(() => void calls.push("adopt"));
        const save = vi.fn(async () => (calls.push("save"), "done"));
        const r = await saveWithPendingCategory({
            pending: { name: " Coffee ", color: "#112233" },
            createCategory,
            onCategoryCreated,
            save,
        });
        expect(r).toBe("done");
        expect(createCategory).toHaveBeenCalledWith({ name: "Coffee", color: "#112233" });
        expect(onCategoryCreated).toHaveBeenCalledWith("c1");
        expect(save).toHaveBeenCalledWith("c1");
        expect(calls).toEqual(["create", "adopt", "save"]);
    });
    it("rejects without adopting or saving when create fails", async () => {
        const onCategoryCreated = vi.fn();
        const save = vi.fn();
        await expect(
            saveWithPendingCategory({
                pending: { name: "A", color: "#112233" },
                createCategory: vi.fn().mockRejectedValue(new Error("boom")),
                onCategoryCreated,
                save,
            }),
        ).rejects.toThrow("boom");
        expect(onCategoryCreated).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
    });
    it("adopts the id even when save fails; retry creates nothing", async () => {
        const createCategory = vi.fn().mockResolvedValue({ id: "c1" });
        const onCategoryCreated = vi.fn();
        await expect(
            saveWithPendingCategory({
                pending: { name: "A", color: "#112233" },
                createCategory,
                onCategoryCreated,
                save: vi.fn().mockRejectedValue(new Error("save failed")),
            }),
        ).rejects.toThrow("save failed");
        expect(onCategoryCreated).toHaveBeenCalledTimes(1);
        const save = vi.fn().mockResolvedValue("ok");
        await saveWithPendingCategory({ pending: null, createCategory, onCategoryCreated, save });
        expect(createCategory).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith(null);
    });
});

describe("pickNewCategoryColor", () => {
    const P = NEW_CATEGORY_PALETTE;

    it("returns the only free colour regardless of random", () => {
        const used = P.slice(1);
        expect(pickNewCategoryColor(used, () => 0)).toBe(P[0]);
        expect(pickNewCategoryColor(used, () => 0.999)).toBe(P[0]);
    });
    it("picks any palette colour by index when all are used", () => {
        expect(pickNewCategoryColor(P, () => 0)).toBe(P[0]);
        expect(pickNewCategoryColor(P, () => 0.999)).toBe(P[P.length - 1]);
    });
    it("treats lowercase used colours as used", () => {
        const used = P.slice(1).map((c) => c.toLowerCase());
        expect(pickNewCategoryColor(used, () => 0.5)).toBe(P[0]);
    });
    it("ignores empty, null and undefined entries", () => {
        const c = pickNewCategoryColor(["", null, undefined, "  "], () => 0.3);
        expect(P).toContain(c);
    });
    it("does not shrink the pool for non-palette used colours", () => {
        const used = ["#123456", "#000000"];
        expect(pickNewCategoryColor(used, () => 0)).toBe(P[0]);
        expect(pickNewCategoryColor(used, () => 0.999)).toBe(P[P.length - 1]);
    });
});
