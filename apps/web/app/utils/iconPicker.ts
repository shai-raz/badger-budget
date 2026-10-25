import {
    AVATAR_ICON_META,
    AVATAR_ICONS_BY_GROUP,
    type AvatarIconGroupId,
    type AvatarIconName,
} from "@badger/shared-data";

/** Icons per row in the picker grid. */
export const ICON_PICKER_COLUMNS = 6;

export interface IconPickerGroup {
    id: AvatarIconGroupId;
    label: string;
    icons: AvatarIconName[];
}

export interface IconGridCell {
    name: AvatarIconName;
    row: number;
    col: number;
}

export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

/** Lower-case words of a text, split on anything that is not a letter or digit (Hebrew included). */
function wordsOf(text: string): string[] {
    return text.toLocaleLowerCase().split(WORD_SPLIT).filter(Boolean);
}

/** Every word an icon can be found by: its registry name, its label and its keywords. */
function searchWords(name: AvatarIconName): string[] {
    const meta = AVATAR_ICON_META[name];
    return [...wordsOf(name), ...wordsOf(meta.label), ...meta.keywords.flatMap(wordsOf)];
}

function allGroups(): IconPickerGroup[] {
    return AVATAR_ICONS_BY_GROUP.map((group) => ({ id: group.id, label: group.label, icons: [...group.icons] }));
}

/**
 * Picker groups narrowed by a search query, in registry order. Every query token must be a prefix of
 * some word of the icon; an empty query keeps every icon. Groups with no matching icon are dropped.
 */
export function filterIconGroups(query: string): IconPickerGroup[] {
    const tokens = wordsOf(query.trim());
    if (tokens.length === 0) return allGroups();
    return allGroups()
        .map((group) => ({
            ...group,
            icons: group.icons.filter((name) => {
                const words = searchWords(name);
                return tokens.every((token) => words.some((word) => word.startsWith(token)));
            }),
        }))
        .filter((group) => group.icons.length > 0);
}

/**
 * Flattens the groups into grid cells. Each group starts on a new row, and a cell's column is its
 * index within the group modulo `columns`.
 */
export function layoutIconGrid(groups: readonly IconPickerGroup[], columns: number): IconGridCell[] {
    const width = Math.max(1, Math.floor(columns));
    const cells: IconGridCell[] = [];
    let firstRow = 0;
    for (const group of groups) {
        group.icons.forEach((name, index) => {
            cells.push({ name, row: firstRow + Math.floor(index / width), col: index % width });
        });
        firstRow += Math.ceil(group.icons.length / width);
    }
    return cells;
}

/**
 * Index of the cell focus moves to for a key press. Left and right step through the cells. Up and down
 * move to the adjacent row, landing on the same column or on that row's last cell when it is shorter.
 * Focus stays put when there is no row in that direction.
 */
export function moveGridFocus(cells: readonly IconGridCell[], index: number, key: GridKey): number {
    if (cells.length === 0) return -1;
    const last = cells.length - 1;
    const from = Math.min(Math.max(index, 0), last);
    switch (key) {
        case "ArrowLeft":
            return Math.max(from - 1, 0);
        case "ArrowRight":
            return Math.min(from + 1, last);
        case "Home":
            return 0;
        case "End":
            return last;
        case "ArrowUp":
        case "ArrowDown": {
            const current = cells[from]!;
            const targetRow = current.row + (key === "ArrowDown" ? 1 : -1);
            const rowIndices: number[] = [];
            cells.forEach((cell, i) => {
                if (cell.row === targetRow) rowIndices.push(i);
            });
            if (rowIndices.length === 0) return from;
            const sameColumn = rowIndices.find((i) => cells[i]!.col === current.col);
            return sameColumn ?? rowIndices[rowIndices.length - 1]!;
        }
    }
}

/**
 * The `icon` to send on a PATCH. Nothing is sent unless the user touched the picker and changed the
 * stored value, so a legacy icon left alone is never overwritten.
 */
export function iconPatch(
    original: string | null | undefined,
    current: AvatarIconName | null,
    touched: boolean,
): { icon?: AvatarIconName | null } {
    if (!touched || current === (original ?? null)) return {};
    return { icon: current };
}
