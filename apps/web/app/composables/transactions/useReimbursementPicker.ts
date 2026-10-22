/**
 * Opens the layout-level reimbursement picker from any page. The dialog is mounted once in
 * layouts/app.vue; `openCount` changes on every open so the picker resets its selection and search.
 */
export const useReimbursementPicker = () => {
    const state = useState<{ visible: boolean; transactionId: string | null; openCount: number }>(
        "reimbursement-picker",
        () => ({ visible: false, transactionId: null, openCount: 0 }),
    );

    const open = (transactionId: string) => {
        state.value = { visible: true, transactionId, openCount: state.value.openCount + 1 };
    };

    return {
        state,
        open,
        close: () => {
            state.value = { ...state.value, visible: false };
        },
    };
};
