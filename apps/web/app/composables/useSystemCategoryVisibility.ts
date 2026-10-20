export const useSystemCategoryVisibility = () => {
    const hideSystemCategories = useLocalStorage("hideSystemCategories", false);

    const toggleSystemCategories = () => {
        hideSystemCategories.value = !hideSystemCategories.value;
    };

    return {
        hideSystemCategories: readonly(hideSystemCategories),
        toggleSystemCategories,
    };
};
