import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "./useApiClient";
import { getLocaleCurrencyCode } from "~/utils/locale-currency";

export function useGoogleSheet() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            await apiClient.syncGoogleSheet(getLocaleCurrencyCode());
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
        },
    });
}
