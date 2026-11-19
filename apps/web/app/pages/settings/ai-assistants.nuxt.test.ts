import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import type { IOAuthConnection } from "@badger/types";
import AiAssistants from "./ai-assistants.vue";

// Shared, resettable fakes for the OAuth composables the page reads and writes.
const m = await vi.hoisted(async () => {
    const { ref } = await import("vue");
    return {
        config: { data: ref<{ mcpServerUrl: string } | undefined>(undefined), isLoading: ref(false) },
        connections: {
            data: ref<IOAuthConnection[] | undefined>([]),
            isLoading: ref(false),
            error: ref<unknown>(null),
        },
        revoke: { mutateAsync: vi.fn(() => Promise.resolve()), isPending: ref(false) },
        toastAdd: vi.fn(),
    };
});

const confirmRequire = vi.hoisted(() => vi.fn());

vi.mock("../../composables/useOAuthConnections", () => ({
    useMcpConfigQuery: () => m.config,
    useOAuthConnectionsQuery: () => m.connections,
    useRevokeOAuthConnection: () => m.revoke,
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: m.toastAdd }) }));
vi.mock("primevue/useconfirm", () => ({ useConfirm: () => ({ require: confirmRequire }) }));

const SERVER_URL = "https://badger.example/mcp";

const connection = (overrides: Partial<IOAuthConnection>): IOAuthConnection => ({
    id: "conn-1",
    clientName: "Claude Desktop",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: null,
    scopes: [],
    ...overrides,
});

const connectedOn = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

beforeEach(() => {
    vi.clearAllMocks();
    m.config.data.value = { mcpServerUrl: SERVER_URL };
    m.config.isLoading.value = false;
    m.connections.data.value = [];
    m.connections.isLoading.value = false;
    m.connections.error.value = null;
    m.revoke.isPending.value = false;
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn(() => Promise.resolve()) },
        configurable: true,
    });
});

async function mountPage(): Promise<VueWrapper> {
    return mountSuspended(AiAssistants);
}

// Collapses the template's line breaks so copy can be matched as one sentence.
const pageText = (wrapper: VueWrapper) => wrapper.text().replace(/\s+/g, " ");

// The band whose heading has this id, so assertions stay inside one section.
const bandText = (wrapper: VueWrapper, headingId: string) =>
    (wrapper.get(`#${headingId}`).element.closest("section")?.textContent ?? "").replace(/\s+/g, " ");

// Opens an app's ⋮ menu and returns its "Revoke access" link, which PrimeVue renders outside the page.
async function openRevokeItem(wrapper: VueWrapper, clientName: string): Promise<HTMLElement | null | undefined> {
    await wrapper.get(`button[aria-label="Actions for ${clientName}"]`).trigger("click");
    await flushPromises();
    const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
        el.textContent?.includes("Revoke access"),
    );
    return item?.querySelector<HTMLElement>(".p-menu-item-link");
}

describe("settings AI assistants page", () => {
    describe("connected apps", () => {
        it("shows each app with its last use and connection date", async () => {
            const used = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            m.connections.data.value = [
                connection({ id: "conn-1", clientName: "Claude Desktop", lastUsedAt: used }),
                connection({ id: "conn-2", clientName: "Codex", createdAt: "2026-03-05T00:00:00.000Z" }),
            ];
            const wrapper = await mountPage();
            const band = bandText(wrapper, "connected-apps-heading");

            expect(band).toContain(`Last used 2 hours ago · connected ${connectedOn("2026-01-01T00:00:00.000Z")}`);
            expect(band).toContain(`Never used · connected ${connectedOn("2026-03-05T00:00:00.000Z")}`);
        });

        it("shows the empty state when no app is connected", async () => {
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain("No apps connected yet.");
        });

        it("shows the band error when connected apps cannot be loaded", async () => {
            m.connections.error.value = new Error("boom");
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain("Couldn't load connected apps.");
            expect(pageText(wrapper)).not.toContain("No apps connected yet.");
        });

        it("revokes an app from its ⋮ menu after confirming", async () => {
            m.connections.data.value = [connection({ id: "conn-1", clientName: "Claude Desktop" })];
            const wrapper = await mountPage();

            const item = await openRevokeItem(wrapper, "Claude Desktop");
            expect(item).toBeTruthy();
            item?.click();
            await flushPromises();

            expect(confirmRequire).toHaveBeenCalledTimes(1);
            expect(confirmRequire).toHaveBeenCalledWith(expect.objectContaining({ header: "Revoke access" }));
            expect(m.revoke.mutateAsync).not.toHaveBeenCalled();

            const options = confirmRequire.mock.calls[0]?.[0] as { accept: () => Promise<void> };
            await options.accept();
            expect(m.revoke.mutateAsync).toHaveBeenCalledWith("conn-1");
            expect(m.toastAdd).toHaveBeenCalledWith(
                expect.objectContaining({ severity: "success", detail: "Claude Desktop revoked" }),
            );
        });

        it("shows the server message when revoking fails", async () => {
            m.connections.data.value = [connection({ id: "conn-1", clientName: "Claude Desktop" })];
            m.revoke.mutateAsync.mockRejectedValueOnce({ response: { data: { message: "Nope" } } });
            const wrapper = await mountPage();

            await openRevokeItem(wrapper, "Claude Desktop").then((item) => item?.click());
            await flushPromises();
            const options = confirmRequire.mock.calls[0]?.[0] as { accept: () => Promise<void> };
            await options.accept();

            expect(m.toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "error", detail: "Nope" }));
            expect(m.toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ severity: "success" }));
        });

        it("falls back to a generic message when revoking fails without one", async () => {
            m.connections.data.value = [connection({ id: "conn-1", clientName: "Claude Desktop" })];
            m.revoke.mutateAsync.mockRejectedValueOnce(new Error("network down"));
            const wrapper = await mountPage();

            await openRevokeItem(wrapper, "Claude Desktop").then((item) => item?.click());
            await flushPromises();
            const options = confirmRequire.mock.calls[0]?.[0] as { accept: () => Promise<void> };
            await options.accept();

            expect(m.toastAdd).toHaveBeenCalledWith(
                expect.objectContaining({ severity: "error", detail: "Failed to revoke access" }),
            );
        });
    });

    describe("connect an app", () => {
        it("shows the server URL and copies it with a toast", async () => {
            const wrapper = await mountPage();
            expect(pageText(wrapper)).toContain(SERVER_URL);

            await wrapper.get('button[aria-label="Copy server URL"]').trigger("click");
            await flushPromises();

            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SERVER_URL);
            expect(m.toastAdd).toHaveBeenCalledWith(expect.objectContaining({ summary: "Copied" }));
        });

        it("shows an error toast when the clipboard write fails", async () => {
            navigator.clipboard.writeText = vi.fn(() => Promise.reject(new Error("denied")));
            const wrapper = await mountPage();

            await wrapper.get('button[aria-label="Copy server URL"]').trigger("click");
            await flushPromises();

            expect(m.toastAdd).toHaveBeenCalledWith(
                expect.objectContaining({ severity: "error", detail: "Could not copy to clipboard" }),
            );
            expect(m.toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ summary: "Copied" }));
        });

        it("links to the five setup guides in a new tab", async () => {
            const wrapper = await mountPage();
            const chips = wrapper.findAll('a[target="_blank"]').map((link) => ({
                name: link.text(),
                href: link.attributes("href"),
                target: link.attributes("target"),
                rel: link.attributes("rel"),
            }));

            expect(chips).toEqual([
                {
                    name: "Claude",
                    href: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
                    target: "_blank",
                    rel: "noopener",
                },
                { name: "Claude Code", href: "https://code.claude.com/docs/en/mcp", target: "_blank", rel: "noopener" },
                {
                    name: "ChatGPT",
                    href: "https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt",
                    target: "_blank",
                    rel: "noopener",
                },
                { name: "Codex", href: "https://developers.openai.com/codex/mcp", target: "_blank", rel: "noopener" },
                {
                    name: "Gemini CLI",
                    href: "https://geminicli.com/docs/tools/mcp-server/",
                    target: "_blank",
                    rel: "noopener",
                },
            ]);
        });

        it("keeps the data-sharing notice below the bands", async () => {
            const wrapper = await mountPage();

            expect(pageText(wrapper)).toContain("Your data is shared with that app's AI provider.");
        });
    });
});
