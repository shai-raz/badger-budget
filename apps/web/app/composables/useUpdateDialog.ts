export const useUpdateDialog = () => {
    const open = useState<boolean>("update-dialog-open", () => false);
    const confirming = useState<boolean>("update-dialog-confirming", () => false);
    // True when the dialog was opened straight on the confirm step, so Cancel should close it.
    const confirmOnly = useState<boolean>("update-dialog-confirm-only", () => false);
    return {
        open,
        confirming,
        confirmOnly,
        openDialog: () => {
            confirming.value = false;
            confirmOnly.value = false;
            open.value = true;
        },
        openConfirm: () => {
            confirming.value = true;
            confirmOnly.value = true;
            open.value = true;
        },
        closeDialog: () => {
            open.value = false;
        },
    };
};
