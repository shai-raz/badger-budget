import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "../useApiClient";
import { getApiErrorMessage } from "../../utils/apiError";
import { useToast } from "primevue/usetoast";
import { invalidateReimbursementAffected } from "./useReimbursements";
import { linksRemovedSuffix } from "../../utils/reimbursement";

export function useMarkCardPayoff() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const toast = useToast();

    return useMutation({
        mutationFn: async ({ id, description }: { id: string; description: string }) => {
            return apiClient.markTransactionAsCardPayoff(id, description);
        },
        onSuccess: (data) => {
            // A re-tag can delete reimbursement links, so refresh everything that reads net amounts.
            invalidateReimbursementAffected(queryClient);

            toast.add({
                severity: "success",
                summary: "Pattern Created",
                detail: `Marked ${data.count} transaction(s) as hidden transfers${linksRemovedSuffix(data.linksRemoved)}`,
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
