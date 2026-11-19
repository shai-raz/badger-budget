import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import type { ISystemInfo } from "@badger/types";
import UpdateDialog from "./UpdateDialog.vue";
import { useUpdateDialog } from "../../composables/useUpdateDialog";

// Shared, resettable fakes for the auto-imported composables the dialog reads. useUpdateDialog stays real, since the
// test is about its confirm state.
const m = await vi.hoisted(async () => {
    const { ref } = await import("vue");
    return {
        info: ref<ISystemInfo | null>(null),
        visible: ref(false),
        dismiss: vi.fn(),
        phase: ref<"upgrading" | null>(null),
        pending: ref<{ targetVersion: string | null } | null>(null),
        actionState: ref<"hidden" | "enabled" | "disabled">("enabled"),
        triggerPending: ref(false),
        startUpgrade: vi.fn(() => Promise.resolve("started")),
        checkMutation: { mutateAsync: vi.fn(() => Promise.resolve()), isPending: ref(false), isSuccess: ref(false) },
    };
});

mockNuxtImport("useUpdateNotice", () => () => ({ info: m.info, visible: m.visible, dismiss: m.dismiss }));
mockNuxtImport("useUpgrade", () => () => ({
    phase: m.phase,
    pending: m.pending,
    actionState: m.actionState,
    triggerPending: m.triggerPending,
    startUpgrade: m.startUpgrade,
}));
mockNuxtImport("useCheckForUpdates", () => () => m.checkMutation);

const ready: ISystemInfo = {
    version: "0.19.1",
    commit: null,
    latest: "0.20.0",
    updateAvailable: true,
    updateComparable: true,
    checkedAt: new Date().toISOString(),
    updateCheckEnabled: true,
    upgradeAvailable: true,
    releaseUrl: null,
};

const mounted: VueWrapper[] = [];

const mountDialog = async () => {
    const wrapper = await mountSuspended(UpdateDialog);
    mounted.push(wrapper);
    await flushPromises();
    return wrapper;
};

// The dialog teleports to <body>, so its content is read from the document.
const bodyText = () => document.body.textContent ?? "";

const buttonWithText = (label: string) =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === label,
    );

const CONFIRM_COPY = "Upgrade to v0.20.0 now?";
const NORMAL_COPY = "You're running version 0.19.1. Version 0.20.0 is available.";

beforeEach(() => {
    vi.clearAllMocks();
    m.info.value = ready;
    m.phase.value = null;
    m.pending.value = null;
    m.actionState.value = "enabled";
    m.triggerPending.value = false;
    useUpdateDialog().closeDialog();
    useUpdateDialog().confirming.value = false;
});

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("UpdateDialog", () => {
    it("opens on the confirm step when opened with openConfirm", async () => {
        await mountDialog();

        useUpdateDialog().openConfirm();
        await flushPromises();

        expect(bodyText()).toContain(CONFIRM_COPY);
        expect(bodyText()).not.toContain(NORMAL_COPY);
        expect(buttonWithText("Cancel")).toBeDefined();
    });

    it("closes when Cancel is clicked on a confirm opened with openConfirm", async () => {
        await mountDialog();
        const { open, openConfirm } = useUpdateDialog();
        openConfirm();
        await flushPromises();

        buttonWithText("Cancel")?.click();
        await flushPromises();

        expect(open.value).toBe(false);
    });

    it("shows the normal body again when reopened after closing a confirm", async () => {
        await mountDialog();
        const { openConfirm, openDialog, closeDialog } = useUpdateDialog();
        openConfirm();
        await flushPromises();
        closeDialog();
        await flushPromises();

        openDialog();
        await flushPromises();

        expect(bodyText()).toContain(NORMAL_COPY);
        expect(bodyText()).not.toContain(CONFIRM_COPY);
    });

    it("returns to the normal body when Cancel is clicked on a confirm opened from the body", async () => {
        await mountDialog();
        const { open, openDialog } = useUpdateDialog();
        openDialog();
        await flushPromises();

        buttonWithText("Upgrade now")?.click();
        await flushPromises();
        expect(bodyText()).toContain(CONFIRM_COPY);

        buttonWithText("Cancel")?.click();
        await flushPromises();

        expect(open.value).toBe(true);
        expect(bodyText()).toContain(NORMAL_COPY);
    });
});
