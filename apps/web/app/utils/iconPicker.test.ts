import { describe, expect, it } from "vitest";
import { AVATAR_ICON_NAMES, AVATAR_ICONS_BY_GROUP, type AvatarIconName } from "@badger/shared-data";
import {
    filterIconGroups,
    ICON_PICKER_COLUMNS,
    iconPatch,
    layoutIconGrid,
    moveGridFocus,
    type IconPickerGroup,
} from "./iconPicker";

const iconsOf = (groups: readonly IconPickerGroup[]): AvatarIconName[] => groups.flatMap((g) => g.icons);

function group(id: IconPickerGroup["id"], icons: AvatarIconName[]): IconPickerGroup {
    return { id, label: id, icons };
}

describe("filterIconGroups", () => {
    it("returns every icon, in registry group order, for an empty query", () => {
        const groups = filterIconGroups("");
        expect(groups.map((g) => g.id)).toEqual(AVATAR_ICONS_BY_GROUP.map((g) => g.id));
        expect(iconsOf(groups).sort()).toEqual([...AVATAR_ICON_NAMES].sort());
        expect(filterIconGroups("   ")).toEqual(groups);
    });

    it("matches a prefix of a registry name word", () => {
        const icons = iconsOf(filterIconGroups("car"));
        expect(icons).toContain("car");
        expect(icons).not.toContain("coffee");
        expect(icons).not.toContain("film");
    });

    it("matches a prefix of a keyword or label word", () => {
        expect(iconsOf(filterIconGroups("coff"))).toContain("coffee");
        expect(filterIconGroups("coff").map((g) => g.id)).toEqual(["food"]);
    });

    it("matches Hebrew keywords", () => {
        expect(iconsOf(filterIconGroups("דלק"))).toContain("fuel");
    });

    it("returns nothing when no icon matches", () => {
        expect(filterIconGroups("xyzzy")).toEqual([]);
    });

    it("requires every query token to match", () => {
        expect(iconsOf(filterIconGroups("rental car"))).toContain("car");
        expect(iconsOf(filterIconGroups("car coffee"))).toEqual([]);
    });

    it("drops groups with no match and keeps registry order", () => {
        const groups = filterIconGroups("car");
        expect(groups.every((g) => g.icons.length > 0)).toBe(true);
        const order = AVATAR_ICONS_BY_GROUP.map((g) => g.id);
        const ids = groups.map((g) => g.id);
        expect(ids).toEqual(order.filter((id) => ids.includes(id)));
    });
});

describe("layoutIconGrid", () => {
    it("starts each group on a new row and wraps at the column count", () => {
        const first = AVATAR_ICON_NAMES.slice(0, 8);
        const second = AVATAR_ICON_NAMES.slice(8, 11);
        const cells = layoutIconGrid([group("food", first), group("shopping", second)], 6);

        expect(cells).toHaveLength(11);
        expect(cells[0]).toEqual({ name: first[0], row: 0, col: 0 });
        expect(cells[5]).toEqual({ name: first[5], row: 0, col: 5 });
        expect(cells[6]).toEqual({ name: first[6], row: 1, col: 0 });
        expect(cells[7]).toEqual({ name: first[7], row: 1, col: 1 });
        expect(cells[8]).toEqual({ name: second[0], row: 2, col: 0 });
        expect(cells[10]).toEqual({ name: second[2], row: 2, col: 2 });
        expect(ICON_PICKER_COLUMNS).toBe(6);
    });

    it("returns no cells for no groups", () => {
        expect(layoutIconGrid([], 6)).toEqual([]);
    });
});

describe("moveGridFocus", () => {
    // Row 0 holds five cells (cols 0-4), row 1 holds two (cols 0-1).
    const cells = layoutIconGrid(
        [group("food", AVATAR_ICON_NAMES.slice(0, 5)), group("shopping", AVATAR_ICON_NAMES.slice(5, 7))],
        6,
    );

    it("moves left and right and clamps at the ends", () => {
        expect(moveGridFocus(cells, 2, "ArrowLeft")).toBe(1);
        expect(moveGridFocus(cells, 0, "ArrowLeft")).toBe(0);
        expect(moveGridFocus(cells, 2, "ArrowRight")).toBe(3);
        expect(moveGridFocus(cells, cells.length - 1, "ArrowRight")).toBe(cells.length - 1);
    });

    it("moves down to the same column, or to the last cell of a shorter row", () => {
        expect(moveGridFocus(cells, 1, "ArrowDown")).toBe(6);
        expect(moveGridFocus(cells, 4, "ArrowDown")).toBe(6);
    });

    it("moves up to the same column of the row above", () => {
        expect(moveGridFocus(cells, 6, "ArrowUp")).toBe(1);
    });

    it("stays put when there is no row in that direction", () => {
        expect(moveGridFocus(cells, 0, "ArrowUp")).toBe(0);
        expect(moveGridFocus(cells, 6, "ArrowDown")).toBe(6);
    });

    it("jumps to the first and last cell on Home and End", () => {
        expect(moveGridFocus(cells, 4, "Home")).toBe(0);
        expect(moveGridFocus(cells, 1, "End")).toBe(cells.length - 1);
    });

    it("returns -1 for an empty grid", () => {
        expect(moveGridFocus([], 0, "ArrowRight")).toBe(-1);
        expect(moveGridFocus([], 0, "End")).toBe(-1);
    });
});

describe("iconPatch", () => {
    it("sends nothing when the picker was not touched", () => {
        expect(iconPatch("car", "house", false)).toEqual({});
    });

    it("sends nothing when touched but unchanged", () => {
        expect(iconPatch("car", "car", true)).toEqual({});
        expect(iconPatch(null, null, true)).toEqual({});
    });

    it("sends the icon when touched and changed", () => {
        expect(iconPatch("car", "house", true)).toEqual({ icon: "house" });
        expect(iconPatch(null, "car", true)).toEqual({ icon: "car" });
    });

    it("sends null when cleared back to the type default", () => {
        expect(iconPatch("car", null, true)).toEqual({ icon: null });
    });

    it("leaves a legacy icon alone unless the user changes it", () => {
        expect(iconPatch("fa-car", null, false)).toEqual({});
        expect(iconPatch("fa-car", "car", false)).toEqual({});
        expect(iconPatch("fa-car", "car", true)).toEqual({ icon: "car" });
    });
});
