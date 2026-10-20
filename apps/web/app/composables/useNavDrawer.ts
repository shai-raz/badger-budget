export const useNavDrawer = () => {
    const open = useState<boolean>("nav-drawer-open", () => false);
    return {
        open,
        openDrawer: () => {
            open.value = true;
        },
        closeDrawer: () => {
            open.value = false;
        },
    };
};
