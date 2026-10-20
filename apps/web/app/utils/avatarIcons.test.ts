import { describe, expect, it } from "vitest";
import { AVATAR_ICON_NAMES, type AvatarIconName } from "@badger/shared-data";
import { AVATAR_ICONS, accountFallbackIcon, resolveAvatarIcon } from "./avatarIcons";

describe("AVATAR_ICONS", () => {
    it("maps every registry name to a defined component", () => {
        for (const name of AVATAR_ICON_NAMES) {
            expect(AVATAR_ICONS[name], name).toBeDefined();
        }
    });

    it("has no entries outside the registry", () => {
        expect(Object.keys(AVATAR_ICONS).sort()).toEqual([...AVATAR_ICON_NAMES].sort());
    });

    it("includes the icons the system categories store", () => {
        expect(AVATAR_ICON_NAMES).toEqual(expect.arrayContaining(["coffee", "utensils", "shirt", "bus"]));
    });
});

describe("resolveAvatarIcon", () => {
    const fallback: AvatarIconName = "tag";

    it("returns the registry component for a known name", () => {
        expect(resolveAvatarIcon("coffee", fallback)).toBe(AVATAR_ICONS.coffee);
    });

    it("returns the fallback component for an unknown name", () => {
        expect(resolveAvatarIcon("not-a-real-icon", fallback)).toBe(AVATAR_ICONS.tag);
    });

    it("returns the fallback component for null or undefined", () => {
        expect(resolveAvatarIcon(null, fallback)).toBe(AVATAR_ICONS.tag);
        expect(resolveAvatarIcon(undefined, fallback)).toBe(AVATAR_ICONS.tag);
    });

    it("returns the fallback component for a legacy Font Awesome name", () => {
        expect(resolveAvatarIcon("tshirt", "shirt")).toBe(AVATAR_ICONS.shirt);
    });

    it("returns the fallback component for an empty string", () => {
        expect(resolveAvatarIcon("", "wallet")).toBe(AVATAR_ICONS.wallet);
    });
});

describe("accountFallbackIcon", () => {
    it("maps each account type to its default icon", () => {
        expect(accountFallbackIcon("bank")).toBe("landmark");
        expect(accountFallbackIcon("credit_card")).toBe("credit-card");
        expect(accountFallbackIcon("cash")).toBe("wallet");
    });

    it("falls back to landmark for unknown, missing or null types", () => {
        expect(accountFallbackIcon("unknown")).toBe("landmark");
        expect(accountFallbackIcon(null)).toBe("landmark");
        expect(accountFallbackIcon(undefined)).toBe("landmark");
    });
});
