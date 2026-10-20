import { useAuthStore } from "~/stores/auth";
import { sanitizeRedirectPath } from "~/utils/safeRedirect";

export default defineNuxtRouteMiddleware((to) => {
    const authStore = useAuthStore();

    // Skip middleware on server
    if (import.meta.server) {
        return;
    }

    const isAuthRoute = to.path.startsWith("/auth");

    // Check if user has tokens (even if store hasn't loaded yet)
    const hasTokens = import.meta.client && localStorage.getItem("access_token");
    const isAuthenticated = authStore.isAuthenticated || hasTokens;

    if (!isAuthenticated && !isAuthRoute) {
        // User is not authenticated and trying to access protected route
        return navigateTo({
            path: "/auth/login",
            query: to.fullPath === "/" ? {} : { redirect: to.fullPath },
        });
    }

    if (isAuthenticated && isAuthRoute) {
        // User is authenticated and on auth page, redirect to app
        return navigateTo(sanitizeRedirectPath(to.query.redirect) ?? "/");
    }
});
