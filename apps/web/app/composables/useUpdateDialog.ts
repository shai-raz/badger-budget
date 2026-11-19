export const useUpdateDialog = () => {
    const open = useState<boolean>("update-dialog-open", () => false);
    const confirming = useState<boolean>("update-dialog-confirming", () => false);
    return {
        open,
        confirming,
        openDialog: () => {
            confirming.value = false;
            open.value = true;
        },
        openConfirm: () => {
            confirming.value = true;
            open.value = true;
        },
        closeDialog: () => {
            open.value = false;
        },
    };
};
