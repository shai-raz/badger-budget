import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { useApiClient } from "../useApiClient";
import { getApiErrorMessage } from "../../utils/apiError";
import { useToast } from "primevue/usetoast";
import type { ICreateCardPayoffPattern } from "@badger/types";

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
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            toast.add({
                severity: "success",
                summary: "Patterns Applied",
                detail: `Updated ${data.count} transaction(s) to hidden transfers`,
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
