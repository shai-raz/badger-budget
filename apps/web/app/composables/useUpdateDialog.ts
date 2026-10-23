export const useUpdateDialog = () => {
    const open = useState<boolean>("update-dialog-open", () => false);
    return {
        open,
        openDialog: () => {
            open.value = true;
        },
        closeDialog: () => {
            open.value = false;
        },
    };
};
