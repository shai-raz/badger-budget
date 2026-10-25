import { describe, expect, it } from "vitest";
import {
    AVATAR_ICON_GROUPS,
    AVATAR_ICON_META,
    AVATAR_ICON_NAMES,
    AVATAR_ICONS_BY_GROUP,
    DEFAULT_CATEGORY_AVATAR_ICON,
    defaultCategoryIcon,
    suggestAvatarIcon,
    type AvatarIconName,
} from "@badger/shared-data";

const PREVIOUS_NAMES = [
    "shopping-cart",
    "coffee",
    "utensils",
    "shirt",
    "bus",
    "hospital",
    "landmark",
    "sofa",
    "laptop",
    "receipt",
    "spray-can",
    "hand-heart",
    "film",
    "graduation-cap",
    "gift",
    "car",
    "shield",
    "smartphone",
    "shopping-bag",
    "circle-help",
    "banknote",
    "tag",
    "piggy-bank",
    "wallet",
    "credit-card",
    "house",
];

describe("avatar icon registry", () => {
    it("has at least 60 icons and keeps every previously stored name", () => {
        expect(AVATAR_ICON_NAMES.length).toBeGreaterThanOrEqual(60);
        expect(AVATAR_ICON_NAMES).toEqual(expect.arrayContaining(PREVIOUS_NAMES));
    });

    it("has no duplicate names", () => {
        expect(new Set(AVATAR_ICON_NAMES).size).toBe(AVATAR_ICON_NAMES.length);
    });

    it("gives every name a valid group, a non-empty label and keywords", () => {
        const groupIds = new Set<string>(AVATAR_ICON_GROUPS.map((g) => g.id));
        for (const name of AVATAR_ICON_NAMES) {
            const meta = AVATAR_ICON_META[name];
            expect(groupIds.has(meta.group), name).toBe(true);
            expect(meta.label.trim().length, name).toBeGreaterThan(0);
            if (name !== "tag" && name !== "circle-help") {
                expect(meta.keywords.length, name).toBeGreaterThanOrEqual(1);
            }
        }
    });

    it("keeps keywords unique across the whole table", () => {
        const all = AVATAR_ICON_NAMES.flatMap((name) => AVATAR_ICON_META[name].keywords);
        expect(new Set(all).size).toBe(all.length);
    });

    it("lists every name exactly once, in registry order, with no empty group", () => {
        const flattened = AVATAR_ICONS_BY_GROUP.flatMap((group) => group.icons);
        expect(flattened).toEqual([...AVATAR_ICON_NAMES]);
        for (const group of AVATAR_ICONS_BY_GROUP) {
            expect(group.icons.length, group.id).toBeGreaterThan(0);
        }
    });

    it("lets every single-word keyword resolve back to its own icon", () => {
        for (const name of AVATAR_ICON_NAMES) {
            for (const keyword of AVATAR_ICON_META[name].keywords) {
                if (keyword.includes(" ")) continue;
                expect({ keyword, icon: suggestAvatarIcon(keyword) }).toEqual({ keyword, icon: name });
            }
        }
    });
});

describe("suggestAvatarIcon", () => {
    const cases: [string, AvatarIconName | null][] = [
        ["Groceries", "shopping-cart"],
        ["GROCERIES", "shopping-cart"],
        ["groceries", "shopping-cart"],
        ["Coffee & Snacks", "coffee"],
        ["Restaurants", "utensils"],
        ["Movies", "film"],
        ["Gas", "fuel"],
        ["Fuel", "fuel"],
        ["Car & Gas", "car"],
        ["Credit card", "credit-card"],
        ["Vegas", null],
        ["Xyzzy", null],
        ["", null],
        ["   ", null],
        ["מסעדות", "utensils"],
        ["דלק", "fuel"],
        ["ביטוח", "shield"],
        ["וביטוח", "shield"],
        ["סופרמרקט", "shopping-cart"],
        ["מזון", "shopping-cart"],
        // Multi-word Hebrew compounds beat the single house keyword בית.
        ["בית ספר", "school"],
        ["בית מרקחת", "pill"],
        ["בית קפה", "coffee"],
        // Whole-word keyword beats the 4-char prefix of "work".
        ["Workout", "dumbbell"],
        // Common budget category names.
        ["Utilities", "zap"],
        ["Eating out", "utensils"],
        ["Taxi", "car"],
        ["Uber", "car"],
        ["Rental car", "car"],
        ["מונית", "car"],
    ];

    it.each(cases)("maps %j to %j", (input, expected) => {
        expect(suggestAvatarIcon(input)).toBe(expected);
    });

    it("does not match Credit card to car", () => {
        expect(suggestAvatarIcon("Credit card")).not.toBe("car");
    });

    it("does not match Vegas to fuel", () => {
        expect(suggestAvatarIcon("Vegas")).not.toBe("fuel");
    });

    it("accepts null and undefined", () => {
        expect(suggestAvatarIcon(null)).toBeNull();
        expect(suggestAvatarIcon(undefined)).toBeNull();
    });
});

describe("defaultCategoryIcon", () => {
    it("falls back to the generic tag when nothing matches", () => {
        expect(defaultCategoryIcon("Xyzzy")).toBe("tag");
        expect(defaultCategoryIcon("Xyzzy")).toBe(DEFAULT_CATEGORY_AVATAR_ICON);
    });

    it("returns the suggested icon when one matches", () => {
        expect(defaultCategoryIcon("Groceries")).toBe("shopping-cart");
    });
});
