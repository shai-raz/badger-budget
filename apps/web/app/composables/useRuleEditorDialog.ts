import type { IRule, ITransactionResponse } from "@badger/types";

export interface RuleEditorDialogState {
    visible: boolean;
    mode: "create" | "edit";
    /** The rule being edited; null when creating. */
    rule: IRule | null;
    /** The transaction a new rule is started from; null otherwise. */
    prefillTransaction: ITransactionResponse | null;
    /** Changes on every open so the editor remounts with fresh values. */
    openCount: number;
}

/**
 * Opens the layout-level rule editor from any page. The dialog is mounted once in the app layout; `openCount`
 * changes on every open so the editor remounts with fresh values.
 */
export const useRuleEditorDialog = () => {
    const state = useState<RuleEditorDialogState>("rule-editor-dialog", () => ({
        visible: false,
        mode: "create",
        rule: null,
        prefillTransaction: null,
        openCount: 0,
    }));

    const show = (next: Omit<RuleEditorDialogState, "visible" | "openCount">) => {
        state.value = { ...next, visible: true, openCount: state.value.openCount + 1 };
    };

    return {
        state,
        openCreate: () => show({ mode: "create", rule: null, prefillTransaction: null }),
        openEdit: (rule: IRule) => show({ mode: "edit", rule, prefillTransaction: null }),
        openFromTransaction: (transaction: ITransactionResponse) =>
            show({ mode: "create", rule: null, prefillTransaction: transaction }),
        close: () => {
            state.value = { ...state.value, visible: false };
        },
    };
};
