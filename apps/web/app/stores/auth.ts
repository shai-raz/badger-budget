import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { ApiClient } from "@badger/api-client";
import type { IAuthUser } from "@badger/types";
import { useApiClient } from "../composables/useApiClient";
import { getApiErrorMessage } from "../utils/apiError";
import { clearAutoSyncKey, loadAutoSyncKey } from "../utils/push/autoSyncKeyStore";
import { unregisterThisBrowserPush } from "../utils/push/pushDeps";

const AUTO_SYNC_CLEANUP_TIMEOUT_MS = 3000;

/**
 * Turns auto-sync off on the server when this browser holds a grant. Time-bounded. It can reject, so callers ignore
 * failures and sign-out still proceeds.
 */
async function disableAutoSyncOnThisDevice(apiClient: ApiClient): Promise<void> {
    if (!(await loadAutoSyncKey())) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, AUTO_SYNC_CLEANUP_TIMEOUT_MS);
    });
    try {
        await Promise.race([apiClient.disableAutoSync().catch(() => undefined), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

export const useAuthStore = defineStore("auth", () => {
    // State
    const user = ref<IAuthUser | null>(null);
    const isAuthenticated = ref(false);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    // Getters
    const isAdmin = computed(() => user.value?.role === "ADMIN");

    // Actions
    async function login(email: string, password: string) {
        const apiClient = useApiClient();

        try {
            isLoading.value = true;
            error.value = null;

            const response = await apiClient.login({ email, password });

            // Store tokens in localStorage
            if (response.accessToken && response.refreshToken) {
                localStorage.setItem("access_token", response.accessToken);
                localStorage.setItem("refresh_token", response.refreshToken);
            }

            user.value = response.user;
            isAuthenticated.value = true;
        } catch (err) {
            const errorMessage = getApiErrorMessage(err, "Login failed");
            error.value = errorMessage;
            isAuthenticated.value = false;
            throw err;
        } finally {
            isLoading.value = false;
        }
    }

    async function register(email: string, password: string, firstName: string, lastName: string) {
        const apiClient = useApiClient();

        try {
            isLoading.value = true;
            error.value = null;

            console.log("[REGISTER] Starting registration with:", { email, firstName, lastName });

            const response = await apiClient.register({
                email,
                password,
                firstName,
                lastName,
            });

            console.log("[REGISTER] Response received:", response);

            // Store tokens in localStorage
            if (response.accessToken && response.refreshToken) {
                localStorage.setItem("access_token", response.accessToken);
                localStorage.setItem("refresh_token", response.refreshToken);
                console.log("[REGISTER] Tokens stored successfully");
            } else {
                console.warn("[REGISTER] No tokens in response:", response);
            }

            user.value = response.user;
            isAuthenticated.value = true;
            console.log("[REGISTER] Registration successful");
        } catch (err) {
            console.error("[REGISTER] Error occurred:", err);
            const errorMessage = getApiErrorMessage(err, "Registration failed");
            error.value = errorMessage;
            isAuthenticated.value = false;
            throw err;
        } finally {
            isLoading.value = false;
        }
    }

    async function loginWithGoogle(code: string, redirectUri: string, codeVerifier: string) {
        const apiClient = useApiClient();

        try {
            isLoading.value = true;
            error.value = null;

            const response = await apiClient.googleAuth({ code, redirectUri, codeVerifier });

            // Store tokens in localStorage
            if (response.accessToken && response.refreshToken) {
                localStorage.setItem("access_token", response.accessToken);
                localStorage.setItem("refresh_token", response.refreshToken);
            }

            user.value = response.user;
            isAuthenticated.value = true;
        } catch (err) {
            const errorMessage = getApiErrorMessage(err, "Google sign-in failed");
            error.value = errorMessage;
            isAuthenticated.value = false;
            throw err;
        } finally {
            isLoading.value = false;
        }
    }

    async function logout() {
        const apiClient = useApiClient();

        // Before the tokens are dropped: these calls need the JWT. Both are time-bounded, so logout always proceeds.
        await disableAutoSyncOnThisDevice(apiClient).catch(() => undefined);
        // Demo users never have push rows.
        if (user.value?.isDemo !== true) {
            await unregisterThisBrowserPush(apiClient).catch(() => undefined);
        }

        try {
            const refreshToken = localStorage.getItem("refresh_token");
            if (refreshToken) {
                await apiClient.logout(refreshToken);
            }
        } catch (err) {
            console.error("Logout error:", err);
        } finally {
            // Clear tokens and state
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");

            user.value = null;
            isAuthenticated.value = false;
            error.value = null;
            // Always, so a signed-out browser never keeps the key for the next person.
            await clearAutoSyncKey().catch(() => undefined);
        }
    }

    async function loadUser() {
        const apiClient = useApiClient();

        try {
            const token = localStorage.getItem("access_token");
            if (!token) {
                isLoading.value = false;
                return;
            }

            isLoading.value = true;

            const userData = await apiClient.getMe();

            user.value = userData;
            isAuthenticated.value = true;
        } catch (err) {
            // Only treat a genuine auth failure as a reason to clear tokens. A 401
            // here means the interceptor already tried (and failed) to refresh — the
            // refresh token is invalid, so it has already cleared tokens and redirected.
            // For transient errors (network, 5xx) keep the refresh token so a later
            // navigation can recover the session instead of forcing a logout.
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (status === 401) {
                localStorage.removeItem("access_token");
                localStorage.removeItem("refresh_token");
                user.value = null;
                isAuthenticated.value = false;
            }
        } finally {
            isLoading.value = false;
        }
    }

    function clearError() {
        error.value = null;
    }

    return {
        user,
        isAuthenticated,
        isAdmin,
        isLoading,
        error,
        login,
        register,
        loginWithGoogle,
        logout,
        loadUser,
        clearError,
    };
});
