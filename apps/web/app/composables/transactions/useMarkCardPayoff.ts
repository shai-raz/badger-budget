import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "../useApiClient";
import { getApiErrorMessage } from "../../utils/apiError";
import { useToast } from "primevue/usetoast";

export function useMarkCardPayoff() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const toast = useToast();

    return useMutation({
        mutationFn: async ({ id, description }: { id: string; description: string }) => {
            return apiClient.markTransactionAsCardPayoff(id, description);
        },
        onSuccess: (data) => {
            // Invalidate all transaction queries to refresh the list
            queryClient.invalidateQueries({ queryKey: ["transactions"] });

            toast.add({
                severity: "success",
                summary: "Pattern Created",
                detail: `Marked ${data.count} transaction(s) as hidden transfers`,
                life: 3000,
            });
        },
        onError: (error) => {
            toast.add({
                severity: "error",
                summary: "Error",
                detail: getApiErrorMessage(error, "Failed to mark transaction as card payoff"),
                life: 5000,
            });
        },
    });
}
