/**
 * Opens the layout-level budget create/edit dialog from any page. The dialog is mounted once in
 * layouts/app.vue; `openCount` changes on every open so the form remounts with fresh values.
 */
export const useBudgetFormDialog = () => {
    const state = useState<{ visible: boolean; budgetId: string | null; openCount: number }>(
        "budget-form-dialog",
        () => ({ visible: false, budgetId: null, openCount: 0 }),
    );

    const open = (budgetId: string | null) => {
        state.value = { visible: true, budgetId, openCount: state.value.openCount + 1 };
    };

    return {
        state,
        openCreate: () => open(null),
        openEdit: (id: string) => open(id),
        close: () => {
            state.value = { ...state.value, visible: false };
        },
    };
};
