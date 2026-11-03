import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { defineComponent, h } from "vue";
import type { VueWrapper } from "@vue/test-utils";
import type { ToastMessageOptions } from "primevue/toast";
import { useToast } from "primevue/usetoast";
import SyncResultToast from "./SyncResultToast.vue";
import { SYNC_RESULT_TOAST_GROUP, type SyncResultToastData } from "../../composables/bankSync/useBankSyncFlow";
import { useSyncRunDialog } from "../../composables/bankSync/useSyncRunDialog";

const mounted: VueWrapper[] = [];

// Mounts the board beside a host that injects the app's real toast service, so results go through the same add path the sync flow uses.
async function mountBoard() {
    let toast!: ReturnType<typeof useToast>;
    const Host = defineComponent({
        setup() {
            toast = useToast();
            return () => h(SyncResultToast);
        },
    });
    const wrapper = await mountSuspended(Host);
    mounted.push(wrapper);
    return toast;
}

// The toast renders into a teleport on document.body, outside the wrapper.
const toastText = () => document.body.textContent ?? "";
const seeWhyLink = () =>
    [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "See why");

const addResult = (toast: ReturnType<typeof useToast>, summary: string, data: SyncResultToastData) => {
    const message: ToastMessageOptions & { data: SyncResultToastData } = {
        group: SYNC_RESULT_TOAST_GROUP,
        severity: "error",
        summary,
        detail: "Wrong username or password.",
        life: 60000,
        data,
    };
    toast.add(message);
};

beforeEach(() => {
    useSyncRunDialog().state.value = { visible: false, jobId: null, expandConnectionId: null };
});

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.restoreAllMocks();
});

describe("SyncResultToast", () => {
    it("opens the run's dialog with every row collapsed, and clears the toast group, from See why", async () => {
        const toast = await mountBoard();
        const removeGroup = vi.spyOn(toast, "removeGroup");
        addResult(toast, "Sync failed", { jobId: "run-9", seeWhy: true });
        await vi.waitFor(() => expect(toastText()).toContain("Sync failed"));

        const link = seeWhyLink();
        expect(link).toBeDefined();
        link!.click();

        expect(removeGroup).toHaveBeenCalledWith(SYNC_RESULT_TOAST_GROUP);
        expect(useSyncRunDialog().state.value).toEqual({ visible: true, jobId: "run-9", expandConnectionId: null });
    });

    it("shows no See why link for a toast that has no failure to explain", async () => {
        const toast = await mountBoard();
        addResult(toast, "Sync interrupted", { jobId: "run-10", seeWhy: false });
        await vi.waitFor(() => expect(toastText()).toContain("Sync interrupted"));

        expect(seeWhyLink()).toBeUndefined();
        expect(toastText()).not.toContain("See why");
    });
});
