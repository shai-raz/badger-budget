import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import type { IAuthUser, ISyncPasskey } from "@badger/types";
import { useAuthStore } from "~/stores/auth";
import { clearDeviceCredentialId, getDeviceCredentialId, setDeviceCredentialId } from "~/utils/syncPasskeyDeviceFlags";
import Passkeys from "./passkeys.vue";

// Shared, resettable fakes for the queries, mutation and unlock composable the page reads and writes.
const m = await vi.hoisted(async () => {
    const { ref } = await import("vue");
    return {
        pinStatus: {
            data: ref<{ hasPinSet: boolean } | undefined>({ hasPinSet: true }),
            isLoading: ref(false),
            error: ref<Error | null>(null),
        },
        passkeys: {
            data: ref<ISyncPasskey[] | undefined>([]),
            isLoading: ref(false),
            error: ref<Error | null>(null),
        },
        deleteMutation: { mutateAsync: vi.fn(() => Promise.resolve()), isPending: ref(false) },
        webAuthn: ref(true),
        unlock: {
            isWebAuthnAvailable: () => m.webAuthn.value,
            register: vi.fn(() => Promise.resolve({})),
        },
        toastAdd: vi.fn(),
    };
});

const confirmRequire = vi.hoisted(() => vi.fn());

vi.mock("../../composables/bankSync/useBankSync", () => ({
    useSyncPinStatusQuery: () => m.pinStatus,
    useSyncPasskeysQuery: () => m.passkeys,
    useDeleteSyncPasskeyMutation: () => m.deleteMutation,
}));
vi.mock("../../composables/bankSync/useSyncUnlock", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../composables/bankSync/useSyncUnlock")>()),
    useSyncUnlock: () => m.unlock,
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: m.toastAdd }) }));
vi.mock("primevue/useconfirm", () => ({ useConfirm: () => ({ require: confirmRequire }) }));

const baseUser = {
    id: "u1",
    email: "a@example.com",
    firstName: "A",
    lastName: "B",
    role: "ADMIN",
    colorTheme: "noir",
    isDemo: false,
} satisfies IAuthUser;

const passkey = (overrides: Partial<ISyncPasskey>): ISyncPasskey => ({
    id: "pk-1",
    credentialId: "cred-a",
    prfSalt: "salt",
    wrappedPinCt: "ct",
    wrappedPinIv: "iv",
    label: "Chrome on Windows",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
});

let mounted: VueWrapper[] = [];
let pageTop: HTMLElement;

beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore().user = { ...baseUser };
    clearDeviceCredentialId("u1");
    m.pinStatus.data.value = { hasPinSet: true };
    m.pinStatus.isLoading.value = false;
    m.pinStatus.error.value = null;
    m.passkeys.data.value = [];
    m.passkeys.isLoading.value = false;
    m.passkeys.error.value = null;
    m.deleteMutation.isPending.value = false;
    m.webAuthn.value = true;
    // The page header teleports its actions into #page-top-bar, which the app layout provides.
    pageTop = document.createElement("div");
    pageTop.id = "page-top-bar";
    document.body.appendChild(pageTop);
});

afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount());
    mounted = [];
    pageTop.remove();
    clearDeviceCredentialId("u1");
});

async function mountPage(): Promise<VueWrapper> {
    const wrapper = await mountSuspended(Passkeys);
    mounted.push(wrapper);
    return wrapper;
}

// Collapses the template's line breaks so copy can be matched as one sentence.
const pageText = (wrapper: VueWrapper) => wrapper.text().replace(/\s+/g, " ");

const headerButton = () => document.querySelector<HTMLButtonElement>('#page-top-bar button[aria-label="New passkey"]');

const rows = (wrapper: VueWrapper) => wrapper.findAll("div.divide-y > div");

// Opens a passkey's ⋮ menu and returns its "Remove passkey" link, which PrimeVue renders outside the page.
async function openRemoveItem(wrapper: VueWrapper, label: string): Promise<HTMLElement | null | undefined> {
    await wrapper.get(`button[aria-label="Actions for ${label}"]`).trigger("click");
    await flushPromises();
    const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
        el.textContent?.includes("Remove passkey"),
    );
    return item?.querySelector<HTMLElement>(".p-menu-item-link");
}

describe("settings passkeys page", () => {
    it("asks for a sync PIN first when none is set, with a link to bank connections", async () => {
        m.pinStatus.data.value = { hasPinSet: false };
        const wrapper = await mountPage();

        expect(pageText(wrapper)).toContain("Set a sync PIN first.");
        expect(wrapper.get('a[href="/bank-connections"]').text()).toContain("Go to bank connections");
        expect(headerButton()).toBeNull();
    });

    it("keeps the list but disables adding when this browser can't create passkeys", async () => {
        m.webAuthn.value = false;
        m.passkeys.data.value = [passkey({})];
        const wrapper = await mountPage();

        expect(pageText(wrapper)).toContain(
            "This browser can't create passkeys. You can still remove the ones you have.",
        );
        expect(rows(wrapper)).toHaveLength(1);
        expect(headerButton()?.disabled).toBe(true);
    });

    it("shows the empty text when there are no passkeys", async () => {
        const wrapper = await mountPage();

        expect(pageText(wrapper)).toContain(
            "No passkeys yet. Add one to unlock bank sync with your fingerprint, face or screen lock.",
        );
        expect(headerButton()?.disabled).toBe(false);
    });

    it("explains why adding is disabled when there are no passkeys and this browser can't create them", async () => {
        m.webAuthn.value = false;
        const wrapper = await mountPage();

        expect(pageText(wrapper)).toContain("This browser can't create passkeys, so add one");
        expect(headerButton()?.disabled).toBe(true);
    });

    it("disables adding and explains the limit at 10 passkeys", async () => {
        m.passkeys.data.value = Array.from({ length: 10 }, (_, index) =>
            passkey({ id: `pk-${index}`, credentialId: `cred-${index}`, label: `Chrome on Windows ${index}` }),
        );
        const wrapper = await mountPage();

        expect(headerButton()?.disabled).toBe(true);
        expect(pageText(wrapper)).toContain("You've reached the limit of 10 passkeys. Remove one to add another.");
    });

    it("tags only the passkey stored for this device", async () => {
        setDeviceCredentialId("u1", "cred-b");
        m.passkeys.data.value = [
            passkey({ id: "pk-a", credentialId: "cred-a", label: "Chrome on Windows" }),
            passkey({ id: "pk-b", credentialId: "cred-b", label: "Safari on iPhone" }),
        ];
        const wrapper = await mountPage();

        const [windowsRow, iphoneRow] = rows(wrapper);
        expect(windowsRow?.text()).not.toContain("This device");
        expect(iphoneRow?.text()).toContain("This device");
        expect(iphoneRow?.find(".pi-mobile").exists()).toBe(true);
        expect(windowsRow?.find(".pi-desktop").exists()).toBe(true);
    });

    it("tags the passkey this device has just added", async () => {
        m.passkeys.data.value = [passkey({ id: "pk-new", credentialId: "cred-new", label: "Chrome on Windows" })];
        m.unlock.register.mockImplementationOnce(() => {
            setDeviceCredentialId("u1", "cred-new");
            return Promise.resolve({} as ISyncPasskey);
        });
        const wrapper = await mountPage();
        expect(rows(wrapper)[0]?.text()).not.toContain("This device");

        headerButton()?.click();
        await flushPromises();
        submitDialogPin("1234");
        await flushPromises();

        expect(rows(wrapper)[0]?.text()).toContain("This device");
    });

    it("removes a passkey after confirmation and clears this device's id when it matched", async () => {
        setDeviceCredentialId("u1", "cred-b");
        m.passkeys.data.value = [passkey({ id: "pk-b", credentialId: "cred-b", label: "Safari on iPhone" })];
        const wrapper = await mountPage();

        const removeLink = await openRemoveItem(wrapper, "Safari on iPhone");
        removeLink?.click();
        await flushPromises();

        expect(confirmRequire).toHaveBeenCalledTimes(1);
        const options = confirmRequire.mock.calls[0]?.[0] as { accept: () => Promise<void> };
        await options.accept();
        await flushPromises();

        expect(m.deleteMutation.mutateAsync).toHaveBeenCalledWith("pk-b");
        expect(getDeviceCredentialId("u1")).toBeNull();
    });

    it("keeps this device's id when a different passkey is removed", async () => {
        setDeviceCredentialId("u1", "cred-b");
        m.passkeys.data.value = [
            passkey({ id: "pk-a", credentialId: "cred-a", label: "Chrome on Windows" }),
            passkey({ id: "pk-b", credentialId: "cred-b", label: "Safari on iPhone" }),
        ];
        const wrapper = await mountPage();

        const removeLink = await openRemoveItem(wrapper, "Chrome on Windows");
        removeLink?.click();
        await flushPromises();
        const options = confirmRequire.mock.calls[0]?.[0] as { accept: () => Promise<void> };
        await options.accept();
        await flushPromises();

        expect(m.deleteMutation.mutateAsync).toHaveBeenCalledWith("pk-a");
        expect(getDeviceCredentialId("u1")).toBe("cred-b");
    });

    it("opens the add dialog from the header and registers with the PIN", async () => {
        await mountPage();

        headerButton()?.click();
        await flushPromises();
        submitDialogPin("1234");
        await flushPromises();

        expect(m.unlock.register).toHaveBeenCalledWith("1234");
    });
});

// Types the PIN into the open dialog and presses its "Add passkey" button.
function submitDialogPin(pin: string) {
    const input = document.querySelector<HTMLInputElement>(".p-dialog input");
    if (!input) throw new Error("the add passkey dialog is not open");
    input.value = pin;
    input.dispatchEvent(new Event("input"));
    const submit = Array.from(document.querySelectorAll<HTMLButtonElement>(".p-dialog button")).find(
        (button) => button.textContent?.trim() === "Add passkey",
    );
    submit?.click();
}
