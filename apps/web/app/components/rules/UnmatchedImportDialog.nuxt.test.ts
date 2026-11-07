import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import UnmatchedImportDialog from "./UnmatchedImportDialog.vue";

const settings = vi.hoisted(() => ({
    mutate: vi.fn(),
    isPending: { value: false },
}));

mockNuxtImport("useUpdateUserSettingsMutation", () => () => ({
    mutate: settings.mutate,
    isPending: ref(settings.isPending.value),
}));

const mounted: VueWrapper[] = [];

const mountDialog = async (props: Record<string, unknown> = {}) => {
    const wrapper = await mountSuspended(UnmatchedImportDialog, {
        props: { mode: "create_or_reuse", visible: true, ...props },
    });
    mounted.push(wrapper);
    await flushPromises();
    return wrapper;
};

// The dialog teleports to <body>, so its content is read from the document.
const radio = (mode: string) => document.getElementById(`unmatched-import-category-${mode}`) as HTMLInputElement | null;

const saveButton = () => {
    const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === "Save",
    );
    if (!button) throw new Error("no Save button");
    return button;
};

beforeEach(() => {
    vi.clearAllMocks();
    settings.isPending.value = false;
});

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("UnmatchedImportDialog", () => {
    it("renders one radio per mode with the saved mode checked", async () => {
        await mountDialog({ mode: "reuse_only" });

        const radios = document.body.querySelectorAll<HTMLInputElement>('input[type="radio"]');
        expect(radios).toHaveLength(3);
        expect(radio("create_or_reuse")?.checked).toBe(false);
        expect(radio("reuse_only")?.checked).toBe(true);
        expect(radio("uncategorized")?.checked).toBe(false);
    });

    it("saves the selected mode and closes on success", async () => {
        const wrapper = await mountDialog({ mode: "create_or_reuse" });
        settings.mutate.mockImplementation((_patch, options: { onSuccess: () => void }) => options.onSuccess());

        radio("uncategorized")!.click();
        await nextTick();
        saveButton().click();
        await flushPromises();

        expect(settings.mutate).toHaveBeenCalledWith(
            { unmatchedImportCategory: "uncategorized" },
            expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
        );
        expect(wrapper.emitted("update:visible")).toEqual([[false]]);
    });

    it("shows the error message and stays open when the save fails", async () => {
        const wrapper = await mountDialog({ mode: "create_or_reuse" });
        settings.mutate.mockImplementation((_patch, options: { onError: (error: unknown) => void }) =>
            options.onError({ response: { data: { message: "The server refused the change." } } }),
        );

        saveButton().click();
        await flushPromises();

        expect(document.body.querySelector(".p-message")?.textContent).toContain("The server refused the change.");
        expect(wrapper.emitted("update:visible")).toBeUndefined();
    });

    it("starts from the saved mode again when reopened after a cancelled change", async () => {
        const wrapper = await mountDialog({ mode: "create_or_reuse" });

        radio("uncategorized")!.click();
        await nextTick();
        await wrapper.setProps({ visible: false });
        await wrapper.setProps({ visible: true });
        await flushPromises();

        expect(radio("create_or_reuse")?.checked).toBe(true);
        expect(radio("uncategorized")?.checked).toBe(false);
    });
});
