export const useGetCategoriesQuery = () => {
    return useQuery({
        queryKey: ["categories"],
        queryFn: async () => {
            const apiClient = useApiClient();
            const categories = await apiClient.getCategories();
            return categories;
        },
    });
};
