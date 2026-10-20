import { useAuthStore } from "~/stores/auth";
import { useApiClient } from "~/composables/useApiClient";
import { getLocaleCurrencyCode } from "~/utils/locale-currency";

export default defineNuxtPlugin(async () => {
    const authStore = useAuthStore();

    // Only run on client side
    if (import.meta.client) {
        // Check if we have tokens and load user before app renders
        const hasToken = localStorage.getItem("access_token");
        if (hasToken) {
            await authStore.loadUser();

            // Trigger the one-time currency backfill for existing users.
            // The endpoint is idempotent — it stamps currencyBackfilledAt on first run
            // and no-ops on every subsequent call. New users are already stamped at
            // registration time and will never run this.
            if (authStore.isAuthenticated) {
                const apiClient = useApiClient();
                apiClient.backfillCurrencies(getLocaleCurrencyCode()).catch(() => {
                    // Silently ignore — backfill is best-effort and non-blocking
                });
            }
        }
    }
});
