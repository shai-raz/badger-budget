import type { ApplyRuleSelection } from "@badger/types";
import type { RuleApplyMode } from "@badger/shared-data";

/**
 * Which would-change transactions a review applies. `allExcept` ticks every row but the ids; `only` ticks just
 * the ids. Rows that are not loaded yet are covered by the mode, so the selection stays valid as pages arrive.
 */
export interface RuleSelection {
    mode: RuleApplyMode;
    ids: ReadonlySet<string>;
}

export type HeaderState = "all" | "some" | "none";

export function selectAll(): RuleSelection {
    return { mode: "allExcept", ids: new Set() };
}

export function isSelected(selection: RuleSelection, id: string): boolean {
    return selection.mode === "allExcept" ? !selection.ids.has(id) : selection.ids.has(id);
}

/** Flips one row. The ids are the exceptions under `allExcept` and the picks under `only`. */
export function toggleRow(selection: RuleSelection, id: string): RuleSelection {
    const ids = new Set(selection.ids);
    if (ids.has(id)) {
        ids.delete(id);
    } else {
        ids.add(id);
    }
    return { mode: selection.mode, ids };
}

/** How many of the `total` would-change transactions are selected. */
export function selectedCount(selection: RuleSelection, total: number): number {
    if (selection.mode === "only") return selection.ids.size;
    return Math.max(0, total - selection.ids.size);
}

export function headerState(selection: RuleSelection, total: number): HeaderState {
    const selected = selectedCount(selection, total);
    if (selected === 0) return "none";
    if (selected >= total) return "all";
    return "some";
}

/** The header checkbox: a fully selected list clears to nothing, anything else selects everything. */
export function toggleAll(selection: RuleSelection, total: number): RuleSelection {
    if (headerState(selection, total) === "all") {
        return { mode: "only", ids: new Set() };
    }
    return selectAll();
}

/** The selection in the shape the API expects on save-and-apply and apply. */
export function toApplySelection(selection: RuleSelection): ApplyRuleSelection {
    return { mode: selection.mode, ids: [...selection.ids] };
}
