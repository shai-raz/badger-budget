import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import type { ISystemInfo } from "@badger/types";
import { RELEASES_URL } from "~/utils/updateNotice";
import About from "./about.vue";

// Shared, resettable fakes for the composables the page and its PageHeader read.
const m = await vi.hoisted(async () => {
    const { ref } = await import("vue");
    return {
        info: ref<ISystemInfo | undefined>(undefined),
        isLoading: ref(false),
        error: ref<unknown>(null),
        checkMutation: { mutateAsync: vi.fn(() => Promise.resolve()), isPending: ref(false) },
        phase: ref<"upgrading" | null>(null),
        pending: ref<{ targetVersion: string | null } | null>(null),
        actionState: ref<"hidden" | "enabled" | "disabled">("hidden"),
        openConfirm: vi.fn(),
        openRecent: vi.fn(),
        toastAdd: vi.fn(),
    };
});

vi.mock("../../composables/useSystemInfo", () => ({
    useSystemInfo: () => ({ data: m.info, isLoading: m.isLoading, error: m.error }),
    useCheckForUpdates: () => m.checkMutation,
}));
vi.mock("../../composables/useUpgrade", () => ({
    useUpgrade: () => ({ phase: m.phase, pending: m.pending, actionState: m.actionState }),
}));
vi.mock("../../composables/useUpdateDialog", () => ({
    useUpdateDialog: () => ({ openConfirm: m.openConfirm }),
}));
vi.mock("../../composables/useWhatsNewDialog", () => ({
    useWhatsNewDialog: () => ({ openRecent: m.openRecent }),
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: m.toastAdd }) }));

const RELEASE_URL = "https://github.com/shai-raz/badger-budget/releases/tag/v0.20.0";

// A release-ready build that was checked two hours ago. Each case overrides the fields it is about.
const base: ISystemInfo = {
    version: "0.19.1",
    commit: "abcdef1234567890",
    latest: "0.19.1",
    updateAvailable: false,
    updateComparable: true,
    checkedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updateCheckEnabled: true,
    upgradeAvailable: false,
    releaseUrl: null,
};

const setInfo = (overrides: Partial<ISystemInfo> = {}) => {
    m.info.value = { ...base, ...overrides };
};

// PageHeader teleports its actions into #page-top-bar, which the app layout provides.
let pageTop: HTMLElement;
let mounted: VueWrapper[] = [];

beforeEach(() => {
    vi.clearAllMocks();
    setInfo();
    m.isLoading.value = false;
    m.error.value = null;
    m.checkMutation.isPending.value = false;
    m.phase.value = null;
    m.pending.value = null;
    m.actionState.value = "hidden";
    pageTop = document.createElement("div");
    pageTop.id = "page-top-bar";
    document.body.appendChild(pageTop);
});

afterEach(() => {
    mounted.forEach((wrapper) => wrapper.unmount());
    mounted = [];
    pageTop.remove();
});

async function mountPage(): Promise<VueWrapper> {
    const wrapper = await mountSuspended(About);
    mounted.push(wrapper);
    return wrapper;
}

// Collapses the template's line breaks so copy can be matched as one sentence.
const pageText = (wrapper: VueWrapper) => wrapper.text().replace(/\s+/g, " ");

// The band whose heading has this id, so assertions stay inside one section.
const bandText = (wrapper: VueWrapper, headingId: string) =>
    (wrapper.get(`#${headingId}`).element.closest("section")?.textContent ?? "").replace(/\s+/g, " ");

const headerButton = () =>
    document.querySelector<HTMLButtonElement>('#page-top-bar button[aria-label="Check for updates"]');

const buttonWithText = (wrapper: VueWrapper, text: string) =>
    wrapper.findAll("button").find((button) => button.text().includes(text));

const linkWithText = (wrapper: VueWrapper, text: string) =>
    wrapper.findAll("a").find((link) => link.text().includes(text));

const statusOf = (wrapper: VueWrapper) => wrapper.get('[role="status"]');

describe("settings about page", () => {
    describe("version status", () => {
        it("shows a green check when up to date", async () => {
            const wrapper = await mountPage();
            const status = statusOf(wrapper);

            expect(status.text()).toContain("You're up to date");
            expect(status.text()).toContain("Checked 2 hours ago");
            expect(status.find("i").classes()).toContain("pi-check-circle");
            expect(status.find("i").classes()).toContain("text-green-600");
        });

        it("offers Upgrade now that opens the confirm dialog when this server can upgrade", async () => {
            setInfo({
                version: "0.19.1",
                latest: "0.20.0",
                updateAvailable: true,
                upgradeAvailable: true,
                releaseUrl: RELEASE_URL,
            });
            m.actionState.value = "enabled";
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain("Version 0.20.0 is available");
            const upgrade = buttonWithText(wrapper, "Upgrade now");
            expect(upgrade).toBeTruthy();
            expect(upgrade?.attributes("disabled")).toBeUndefined();

            await upgrade?.trigger("click");
            expect(m.openConfirm).toHaveBeenCalledTimes(1);
        });

        it("links the release notes from an available update", async () => {
            setInfo({
                latest: "0.20.0",
                updateAvailable: true,
                upgradeAvailable: true,
                releaseUrl: RELEASE_URL,
            });
            m.actionState.value = "enabled";
            const wrapper = await mountPage();

            const notes = linkWithText(wrapper, "Release notes");
            expect(notes?.attributes("href")).toBe(RELEASE_URL);
            expect(notes?.attributes("target")).toBe("_blank");
        });

        it("explains who can update when this server cannot upgrade itself", async () => {
            setInfo({ latest: "0.20.0", updateAvailable: true, upgradeAvailable: false, releaseUrl: RELEASE_URL });
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain("Whoever runs this Badger server can update it.");
            expect(buttonWithText(wrapper, "Upgrade now")).toBeUndefined();
            expect(linkWithText(wrapper, "Release notes")?.attributes("href")).toBe(RELEASE_URL);
        });

        it("shows the upgrade target while an upgrade runs", async () => {
            setInfo({ latest: "0.20.0", updateAvailable: true, upgradeAvailable: true });
            m.phase.value = "upgrading";
            m.pending.value = { targetVersion: "0.20.0" };
            m.actionState.value = "disabled";
            const wrapper = await mountPage();

            expect(statusOf(wrapper).text()).toContain("Upgrading to 0.20.0");
            expect(buttonWithText(wrapper, "Upgrade now")).toBeUndefined();
        });

        it("says update checks are off and disables the header check", async () => {
            setInfo({ updateCheckEnabled: false, checkedAt: null });
            const wrapper = await mountPage();

            expect(statusOf(wrapper).text()).toContain("Update checks are off");
            expect(headerButton()?.disabled).toBe(true);
        });

        it("says a development build is not compared with releases and disables the header check", async () => {
            setInfo({ version: "0.19.1-dev", updateComparable: false });
            const wrapper = await mountPage();

            expect(statusOf(wrapper).text()).toContain("Development build");
            expect(headerButton()?.disabled).toBe(true);
        });

        it("says not checked yet before the first check", async () => {
            setInfo({ checkedAt: null });
            const wrapper = await mountPage();

            expect(statusOf(wrapper).text()).toContain("Not checked yet");
            expect(headerButton()?.disabled).toBe(false);
        });
    });

    describe("header check", () => {
        it("runs a check when the header button is clicked", async () => {
            await mountPage();

            headerButton()?.click();
            await flushPromises();

            expect(m.checkMutation.mutateAsync).toHaveBeenCalledTimes(1);
        });

        it("shows the server message when a check fails", async () => {
            m.checkMutation.mutateAsync.mockRejectedValueOnce({ response: { data: { message: "Nope" } } });
            await mountPage();

            headerButton()?.click();
            await flushPromises();

            expect(m.toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "error", detail: "Nope" }));
        });

        it("falls back to a generic message when a check fails without one", async () => {
            m.checkMutation.mutateAsync.mockRejectedValueOnce(new Error("network down"));
            await mountPage();

            headerButton()?.click();
            await flushPromises();

            expect(m.toastAdd).toHaveBeenCalledWith(
                expect.objectContaining({ severity: "error", detail: "Could not check for updates" }),
            );
        });
    });

    describe("details", () => {
        it("hides the commit and latest release rows when their values are null", async () => {
            setInfo({ commit: null, latest: null });
            const wrapper = await mountPage();
            const band = bandText(wrapper, "version-heading");

            expect(band).toContain("Version");
            expect(band).not.toContain("Commit");
            expect(band).not.toContain("Latest release");
        });

        it("shows the short commit and latest release when they are known", async () => {
            setInfo({ commit: "abcdef1234567890", latest: "0.19.1" });
            const wrapper = await mountPage();
            const band = bandText(wrapper, "version-heading");

            expect(band).toContain("Commit");
            expect(band).toContain("abcdef1");
            expect(band).toContain("Latest release");
        });
    });

    describe("releases", () => {
        it("opens the recent What's new dialog from its row", async () => {
            setInfo({ version: "0.19.1" });
            const wrapper = await mountPage();

            expect(bandText(wrapper, "releases-heading")).toContain("What changed in 0.19.1");
            await buttonWithText(wrapper, "What's new")?.trigger("click");

            expect(m.openRecent).toHaveBeenCalledTimes(1);
        });

        it("links All release notes to the GitHub releases page in a new tab", async () => {
            const wrapper = await mountPage();
            const link = linkWithText(wrapper, "All release notes");

            expect(link?.attributes("href")).toBe(RELEASES_URL);
            expect(link?.attributes("target")).toBe("_blank");
        });
    });
});
