export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
    const copy = [...items];
    const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < copy.length;
    if (!inRange(from) || !inRange(to) || from === to) return copy;

    const moved = copy.splice(from, 1);
    copy.splice(to, 0, ...moved);
    return copy;
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function canMoveUp(index: number): boolean {
    return index > 0;
}

export function canMoveDown(index: number, length: number): boolean {
    return index < length - 1;
}

export interface KeyboardReorderState {
    ids: string[];
    /** Index of the picked row, or null when nothing is picked. */
    picked: number | null;
    /** The order when the row was picked up, restored on Escape. */
    original: string[] | null;
}

export type KeyboardReorderKey = "Space" | "ArrowUp" | "ArrowDown" | "Escape";

export interface KeyboardReorderResult {
    state: KeyboardReorderState;
    /** The new order to save when a drop changed it; otherwise null. */
    commit: string[] | null;
}

/**
 * Keyboard reorder: Space picks up the focused row, arrows move the picked row (clamped at the ends),
 * Space drops it and commits the order if it changed, Escape puts the original order back.
 */
export function keyboardReorder(
    state: KeyboardReorderState,
    key: KeyboardReorderKey,
    focusIndex: number,
): KeyboardReorderResult {
    switch (key) {
        case "Space": {
            if (state.picked === null) {
                return {
                    state: { ids: [...state.ids], picked: focusIndex, original: [...state.ids] },
                    commit: null,
                };
            }
            const changed = state.original !== null && !sameOrder(state.ids, state.original);
            return {
                state: { ids: [...state.ids], picked: null, original: null },
                commit: changed ? [...state.ids] : null,
            };
        }
        case "ArrowUp":
        case "ArrowDown": {
            if (state.picked === null) return { state, commit: null };
            const step = key === "ArrowUp" ? -1 : 1;
            const target = Math.min(Math.max(state.picked + step, 0), state.ids.length - 1);
            return {
                state: { ids: moveItem(state.ids, state.picked, target), picked: target, original: state.original },
                commit: null,
            };
        }
        case "Escape": {
            if (state.picked === null) return { state, commit: null };
            return {
                state: { ids: state.original ? [...state.original] : [...state.ids], picked: null, original: null },
                commit: null,
            };
        }
    }
}
