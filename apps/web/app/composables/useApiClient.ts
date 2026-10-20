import { ApiClient } from "@badger/api-client";
import { sanitizeRedirectPath } from "~/utils/safeRedirect";

let apiClientInstance: ApiClient | null = null;

export const useApiClient = () => {
    const config = useRuntimeConfig();
    const router = useRouter();

    if (!apiClientInstance) {
        const baseURL = config.public.apiBaseUrl as string;
        console.log("[API CLIENT] Initializing with baseURL:", baseURL);

        apiClientInstance = new ApiClient({
            baseURL,
            timeout: 30000,

            getAccessToken: async () => {
                if (import.meta.client) {
                    return localStorage.getItem("access_token");
                }
                return null;
            },

            getRefreshToken: async () => {
                if (import.meta.client) {
                    return localStorage.getItem("refresh_token");
                }
                return null;
            },

            setTokens: async (accessToken: string, refreshToken: string) => {
                if (import.meta.client) {
                    localStorage.setItem("access_token", accessToken);
                    localStorage.setItem("refresh_token", refreshToken);
                }
            },

            clearTokens: async () => {
                if (import.meta.client) {
                    localStorage.removeItem("access_token");
                    localStorage.removeItem("refresh_token");
                }
            },

            onAuthRequired: () => {
                // Redirect to login when refresh fails
                if (import.meta.client) {
                    // Already on an auth page (keeps its existing redirect): don't wrap it again
                    if (router.currentRoute.value.path.startsWith("/auth")) return;
                    const redirect = sanitizeRedirectPath(router.currentRoute.value.fullPath);
                    router.push({ path: "/auth/login", query: redirect && redirect !== "/" ? { redirect } : {} });
                }
            },
        });

        console.log("[API CLIENT] Instance created successfully");
    }

    return apiClientInstance;
};
