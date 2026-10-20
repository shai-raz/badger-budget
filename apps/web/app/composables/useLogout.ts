import { useAuthStore } from "../stores/auth";
import { runLogout } from "../utils/logout";

export const useLogout = () => {
    const authStore = useAuthStore();
    const router = useRouter();
    return (close?: () => void) =>
        runLogout({
            logout: () => authStore.logout(),
            navigate: (p) => router.push(p),
            close,
        });
};
