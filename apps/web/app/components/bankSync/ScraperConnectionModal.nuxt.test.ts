import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { useNuxtApp } from "#app";
import type { VueWrapper } from "@vue/test-utils";
import type { IScraperConnectionResponse, ISyncPasskey } from "@badger/types";
import ScraperConnectionModal from "./ScraperConnectionModal.vue";

const api = vi.hoisted(() => ({
    getSyncPinStatus: vi.fn(),
    getSyncPasskeys: vi.fn(),
    updateScraperConnection: vi.fn(),
}));
const toastAdd = vi.hoisted(() => vi.fn());
const flow = vi.hoisted(() => ({ syncConnectionWithPin: vi.fn() }));
const unlockState = vi.hoisted(() => ({ available: false, unlock: vi.fn() }));

// The real mutations and passkey query run against this fake API; the sync flow, passkey unlock and toast are stubbed.
vi.mock("../../composables/useApiClient", () => ({ useApiClient: () => api }));
vi.mock("../../composables/bankSync/useBankSyncFlow", () => ({ useBankSyncFlow: () => flow }));
vi.mock("../../composables/bankSync/useSyncUnlock", () => ({
    useSyncUnlock: () => ({ isWebAuthnAvailable: () => unlockState.available, unlock: unlockState.unlock }),
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: toastAdd }) }));

const connection = (isActive: boolean): IScraperConnectionResponse => ({
    id: "c1",
    companyId: "visaCal",
    displayName: "Visa Cal",
    scrapeLookbackDays: 30,
    isActive,
    lastSyncedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    latestJob: null,
});

const passkey: ISyncPasskey = {
    id: "pk1",
    credentialId: "cred-1",
    prfSalt: "salt",
    wrappedPinCt: "ct",
    wrappedPinIv: "iv",
    label: "Laptop",
    createdAt: "2026-01-01T00:00:00Z",
};

// The dialog teleports to <body>, so the form is queried there rather than through the wrapper.
const mounted: VueWrapper[] = [];
const field = (selector: string) => document.body.querySelector<HTMLInputElement>(selector);
const usernameInput = () => field('input[placeholder="Username"]');
const passwordInput = () => field(".p-password input");
const pinInput = () => field('input[placeholder="Enter your sync PIN to encrypt credentials"]');
const displayNameInput = () => field('input[placeholder="Display name"]');
const buttonWithText = (text: string) =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
        b.textContent?.includes(text),
    ) ?? null;
const saveButton = () => buttonWithText("Save changes");
const hasAutofocus = (el: HTMLInputElement | null) => !!el && (el.autofocus || el.hasAttribute("autofocus"));

function typeInto(input: HTMLInputElement | null, value: string) {
    if (!input) throw new Error("input is not rendered");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function openEdit(options: { connection?: IScraperConnectionResponse; updateLogin?: boolean } = {}) {
    // Mounted hidden: the form is prefilled when the parent opens the dialog, which the watcher only sees on a change.
    const wrapper = await mountSuspended(ScraperConnectionModal, {
        props: { visible: false, connection: options.connection ?? connection(true), updateLogin: options.updateLogin },
    });
    mounted.push(wrapper);
    await wrapper.setProps({ visible: true });
    await vi.waitFor(() => expect(usernameInput()).not.toBeNull());
    return wrapper;
}

async function clickSave() {
    await vi.waitFor(() => expect(saveButton()?.disabled).toBe(false));
    const button = saveButton();
    if (!button) throw new Error("Save button is not rendered");
    button.click();
}

beforeEach(() => {
    vi.clearAllMocks();
    // The query client is shared across mounts in this file, so each test starts from an empty cache.
    useNuxtApp().$queryClient.clear();
    unlockState.available = false;
    api.getSyncPinStatus.mockResolvedValue({ hasPinSet: false });
    api.getSyncPasskeys.mockResolvedValue([]);
});

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("ScraperConnectionModal auto-sync after a save", () => {
    it("syncs an active connection with the PIN it saved after a credential change", async () => {
        api.updateScraperConnection.mockResolvedValue(connection(true));
        await openEdit({ updateLogin: true });

        typeInto(usernameInput(), "alice");
        typeInto(passwordInput(), "hunter2");
        typeInto(pinInput(), "1234");
        await clickSave();

        await vi.waitFor(() => expect(flow.syncConnectionWithPin).toHaveBeenCalledWith("c1", "1234", { typed: true }));
        expect(api.updateScraperConnection).toHaveBeenCalledWith("c1", {
            displayName: "Visa Cal",
            scrapeLookbackDays: 30,
            pin: "1234",
            credentials: { username: "alice", password: "hunter2" },
        });
    });

    it("does not sync after a name-only edit", async () => {
        api.updateScraperConnection.mockResolvedValue(connection(true));
        await openEdit();

        typeInto(displayNameInput(), "Visa Main");
        await clickSave();

        await vi.waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "success" })));
        expect(api.updateScraperConnection).toHaveBeenCalledWith("c1", {
            displayName: "Visa Main",
            scrapeLookbackDays: 30,
        });
        expect(flow.syncConnectionWithPin).not.toHaveBeenCalled();
    });

    it("does not sync a credential change from a plain edit", async () => {
        api.updateScraperConnection.mockResolvedValue(connection(true));
        await openEdit();

        typeInto(usernameInput(), "alice");
        typeInto(passwordInput(), "hunter2");
        typeInto(pinInput(), "1234");
        await clickSave();

        await vi.waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "success" })));
        expect(api.updateScraperConnection).toHaveBeenCalledWith("c1", {
            displayName: "Visa Cal",
            scrapeLookbackDays: 30,
            pin: "1234",
            credentials: { username: "alice", password: "hunter2" },
        });
        expect(flow.syncConnectionWithPin).not.toHaveBeenCalled();
    });

    it("does not sync a credential change on a paused connection", async () => {
        api.updateScraperConnection.mockResolvedValue(connection(false));
        await openEdit({ connection: connection(false), updateLogin: true });

        typeInto(usernameInput(), "alice");
        typeInto(passwordInput(), "hunter2");
        typeInto(pinInput(), "1234");
        await clickSave();

        await vi.waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "success" })));
        expect(api.updateScraperConnection).toHaveBeenCalledWith("c1", expect.objectContaining({ pin: "1234" }));
        expect(flow.syncConnectionWithPin).not.toHaveBeenCalled();
    });

    it("syncs with the passkey-unlocked PIN and marks it as not typed", async () => {
        unlockState.available = true;
        unlockState.unlock.mockResolvedValue("4321");
        api.getSyncPinStatus.mockResolvedValue({ hasPinSet: true });
        api.getSyncPasskeys.mockResolvedValue([passkey]);
        api.updateScraperConnection.mockResolvedValue(connection(true));
        await openEdit({ updateLogin: true });
        await vi.waitFor(() => expect(buttonWithText("Use PIN instead")).not.toBeNull());

        typeInto(usernameInput(), "alice");
        typeInto(passwordInput(), "hunter2");
        await clickSave();

        await vi.waitFor(() => expect(flow.syncConnectionWithPin).toHaveBeenCalledWith("c1", "4321", { typed: false }));
        expect(unlockState.unlock).toHaveBeenCalledWith([passkey]);
        expect(api.updateScraperConnection).toHaveBeenCalledWith("c1", expect.objectContaining({ pin: "4321" }));
    });
});

describe("ScraperConnectionModal login focus", () => {
    it("focuses only the first login field when opened to fix a login", async () => {
        await openEdit({ updateLogin: true });

        expect(hasAutofocus(usernameInput())).toBe(true);
        expect(hasAutofocus(passwordInput())).toBe(false);
    });

    it("focuses no login field on a plain edit", async () => {
        await openEdit();

        expect(hasAutofocus(usernameInput())).toBe(false);
        expect(hasAutofocus(passwordInput())).toBe(false);
    });
});
