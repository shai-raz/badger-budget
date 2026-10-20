import { useQuery } from "@tanstack/vue-query";
import { useApiClient } from "../useApiClient";
import type { ICurrencyResponse } from "@badger/types";

// Query keys. Must stay ["currencies"] to share the cache with the inline currency queries elsewhere.
export const currencyKeys = {
    all: ["currencies"] as const,
};

export function useGetCurrencies() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: currencyKeys.all,
        queryFn: (): Promise<ICurrencyResponse[]> => apiClient.getCurrencies(),
        staleTime: Infinity,
    });
}
