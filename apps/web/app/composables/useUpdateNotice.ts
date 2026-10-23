import { computed } from "vue";
import { useSystemInfo } from "./useSystemInfo";
import { useAuthStore } from "~/stores/auth";
import { isUpdateNoticeVisible } from "~/utils/updateNotice";

const DISMISSED_KEY = "updateNoticeDismissedVersion";

/** App-shell update notice. Fetches system info only while signed in; the dismissed version is kept per browser. */
export const useUpdateNotice = () => {
    const authStore = useAuthStore();
    const { data } = useSystemInfo(() => authStore.isAuthenticated);
    const dismissedVersion = useLocalStorage<string | null>(DISMISSED_KEY, null);

    const info = computed(() => data.value ?? null);
    const visible = computed(() => isUpdateNoticeVisible(info.value, dismissedVersion.value));

    const dismiss = () => {
        if (info.value?.latest) dismissedVersion.value = info.value.latest;
    };

    return { info, visible, dismiss };
};
