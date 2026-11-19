import { describe, expect, it } from "vitest";
import { PUSH_SUBSCRIPTION_ID_KEY, pushIdStore } from "./pushSubscriptionIdStore";

function memoryStorage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
        values,
    };
}

const throwing = {
    getItem: () => {
        throw new Error("blocked");
    },
    setItem: () => {
        throw new Error("blocked");
    },
    removeItem: () => {
        throw new Error("blocked");
    },
};

describe("pushIdStore", () => {
    it("saves, loads and clears the id under its key", () => {
        const storage = memoryStorage();
        const store = pushIdStore(storage);

        expect(store.load()).toBeNull();
        store.save("sub-1");
        expect(storage.values.get(PUSH_SUBSCRIPTION_ID_KEY)).toBe("sub-1");
        expect(store.load()).toBe("sub-1");
        store.clear();
        expect(store.load()).toBeNull();
    });

    it.each([
        ["missing", null],
        ["blocked", throwing],
    ])("never throws when storage is %s", (_label, storage) => {
        const store = pushIdStore(storage);

        expect(store.load()).toBeNull();
        expect(() => store.save("sub-1")).not.toThrow();
        expect(() => store.clear()).not.toThrow();
    });
});
