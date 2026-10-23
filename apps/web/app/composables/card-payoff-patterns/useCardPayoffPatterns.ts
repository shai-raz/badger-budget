import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "../useApiClient";
import { getApiErrorMessage } from "../../utils/apiError";
import { useToast } from "primevue/usetoast";
import type { ICreateCardPayoffPattern } from "@badger/types";
import { invalidateReimbursementAffected } from "../transactions/useReimbursements";
import { linksRemovedSuffix } from "../../utils/reimbursement";

export const cardPayoffPatternKeys = {
    all: ["cardPayoffPatterns"] as const,
    lists: () => [...cardPayoffPatternKeys.all, "list"] as const,
    list: () => [...cardPayoffPatternKeys.lists()] as const,
};

export function useGetCardPayoffPatterns() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: cardPayoffPatternKeys.list(),
        queryFn: () => apiClient.getCardPayoffPatterns(),
    });
}

/**
 * How many reimbursement links a card-payoff re-tag of `description` would remove.
 * Fetched only while `enabled` (the dialog is open); staleTime 0 so each open re-checks.
 */
export function useCardPayoffLinkPreview(description: Ref<string | null>, enabled: Ref<boolean>) {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: computed(() => ["card-payoff-patterns", "link-preview", description.value]),
        queryFn: () => apiClient.getCardPayoffLinkPreview(description.value ?? ""),
        enabled: computed(() => enabled.value && !!description.value),
        staleTime: 0,
    });
}

/** Imperative loader for the Apply-all confirm, which needs the preview before the dialog opens. */
export function useApplyAllLinkPreviewLoader() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return () =>
        queryClient.fetchQuery({
            queryKey: ["card-payoff-patterns", "apply-all-link-preview"],
            queryFn: () => apiClient.getApplyAllCardPayoffLinkPreview(),
            staleTime: 0,
        });
}

export function useCreateCardPayoffPattern() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const toast = useToast();

    return useMutation({
        mutationFn: (data: ICreateCardPayoffPattern) => apiClient.createCardPayoffPattern(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: cardPayoffPatternKeys.all });
            toast.add({
                severity: "success",
                summary: "Success",
                detail: "Card payoff pattern created successfully",
                life: 3000,
            });
        },
        onError: (error) => {
            toast.add({
                severity: "error",
                summary: "Error",
                detail: getApiErrorMessage(error, "Failed to create pattern"),
                life: 5000,
            });
        },
    });
}

export function useDeleteCardPayoffPattern() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const toast = useToast();

    return useMutation({
        mutationFn: (id: string) => apiClient.deleteCardPayoffPattern(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: cardPayoffPatternKeys.all });
            toast.add({
                severity: "success",
                summary: "Success",
                detail: "Card payoff pattern deleted successfully",
                life: 3000,
            });
        },
        onError: (error) => {
            toast.add({
                severity: "error",
                summary: "Error",
                detail: getApiErrorMessage(error, "Failed to delete pattern"),
                life: 5000,
            });
        },
    });
}

export function useApplyAllCardPayoffPatterns() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const toast = useToast();

    return useMutation({
        mutationFn: () => apiClient.applyAllCardPayoffPatterns(),
        onSuccess: (data) => {
            invalidateReimbursementAffected(queryClient);
            toast.add({
                severity: "success",
                summary: "Patterns Applied",
                detail: `Updated ${data.count} transaction(s) to hidden transfers${linksRemovedSuffix(data.linksRemoved)}`,
                life: 3000,
            });
        },
        onError: (error) => {
            toast.add({
                severity: "error",
                summary: "Error",
                detail: getApiErrorMessage(error, "Failed to apply patterns"),
                life: 5000,
            });
        },
    });
}
