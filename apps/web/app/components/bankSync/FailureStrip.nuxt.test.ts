import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import type { Ref } from "vue";
import type { IScraperConnectionLatestJob, IScraperConnectionResponse } from "@badger/types";
import FailureStrip from "./FailureStrip.vue";
import { useConnectionEditor } from "../../composables/bankSync/useConnectionEditor";
import { useSyncRunDialog } from "../../composables/bankSync/useSyncRunDialog";
import { syncErrorCopy } from "../../utils/syncErrors";

const flow = vi.hoisted(() => ({ requestSync: vi.fn(), busy: null as Ref<boolean> | null }));

// The strip reads the sync flow from the layout; here the flow is stubbed with a settable busy flag.
vi.mock("../../composables/bankSync/useBankSyncFlow", async () => {
    const { ref } = await import("vue");
    flow.busy = ref(false);
    return { useBankSyncFlow: () => ({ requestSync: flow.requestSync, busy: flow.busy }) };
});

type ErrorCode = NonNullable<IScraperConnectionLatestJob["errorCode"]>;

const connection = (
    errorCode: ErrorCode | null,
    overrides: Partial<IScraperConnectionResponse> = {},
): IScraperConnectionResponse => ({
    id: "conn-b",
    companyId: "hapoalim",
    displayName: "Hapoalim",
    scrapeLookbackDays: 30,
    isActive: true,
    lastSyncedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    latestJob: { syncJobId: "run-1", status: "failed", errorCode, finishedAt: new Date("2026-03-01T10:01:00Z") },
    ...overrides,
});

const mounted: VueWrapper[] = [];

async function mountStrip(item: IScraperConnectionResponse) {
    const wrapper = await mountSuspended(FailureStrip, { props: { connection: item } });
    mounted.push(wrapper);
    return wrapper;
}

const buttonLabelled = (wrapper: VueWrapper, label: string) =>
    wrapper.findAll("button").find((button) => button.text() === label) ?? null;
const bodyButton = (wrapper: VueWrapper, code: ErrorCode) =>
    wrapper.find(`button[aria-label="${syncErrorCopy(code).short}, see details"]`);

beforeEach(() => {
    vi.clearAllMocks();
    flow.busy!.value = false;
    useSyncRunDialog().state.value = { visible: false, jobId: null, expandConnectionId: null };
    useConnectionEditor().state.value = { visible: false, connection: null, focusLogin: false };
});

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("FailureStrip", () => {
    it("renders nothing when the latest run succeeded", async () => {
        const wrapper = await mountStrip(
            connection(null, {
                latestJob: { syncJobId: "run-1", status: "success", errorCode: null, finishedAt: new Date() },
            }),
        );

        expect(wrapper.find("button").exists()).toBe(false);
        expect(wrapper.text()).toBe("");
    });

    it("renders nothing for a paused connection, even when its last run failed", async () => {
        const wrapper = await mountStrip(connection("INVALID_PASSWORD", { isActive: false }));

        expect(wrapper.find("button").exists()).toBe(false);
    });

    it("shows the short message and Update login for a wrong password", async () => {
        const wrapper = await mountStrip(connection("INVALID_PASSWORD"));

        expect(wrapper.text()).toContain("Wrong username or password");
        expect(buttonLabelled(wrapper, "Update login")).not.toBeNull();
        expect(buttonLabelled(wrapper, "Retry")).toBeNull();
    });

    it("opens the editor on the login fields from Update login", async () => {
        const wrapper = await mountStrip(connection("INVALID_PASSWORD"));

        buttonLabelled(wrapper, "Update login")?.trigger("click");

        expect(useConnectionEditor().state.value).toEqual({
            visible: true,
            connection: expect.objectContaining({ id: "conn-b" }),
            focusLogin: true,
        });
        expect(flow.requestSync).not.toHaveBeenCalled();
    });

    it("shows Retry for a timeout and starts a sync of that connection", async () => {
        const wrapper = await mountStrip(connection("TIMEOUT"));

        buttonLabelled(wrapper, "Retry")?.trigger("click");

        expect(flow.requestSync).toHaveBeenCalledWith({ connectionId: "conn-b" });
        expect(useConnectionEditor().state.value.visible).toBe(false);
    });

    it("disables Retry while a sync is busy", async () => {
        flow.busy!.value = true;
        const wrapper = await mountStrip(connection("TIMEOUT"));

        expect(buttonLabelled(wrapper, "Retry")?.attributes("disabled")).toBeDefined();
    });

    it("shows no action for an error the user cannot fix from here", async () => {
        const wrapper = await mountStrip(connection("ACCOUNT_BLOCKED"));

        expect(wrapper.text()).toContain(syncErrorCopy("ACCOUNT_BLOCKED").short);
        expect(buttonLabelled(wrapper, "Retry")).toBeNull();
        expect(buttonLabelled(wrapper, "Update login")).toBeNull();
        expect(bodyButton(wrapper, "ACCOUNT_BLOCKED").exists()).toBe(true);
    });

    it("opens the run's dialog with only this connection expanded from the strip body", async () => {
        const wrapper = await mountStrip(connection("INVALID_PASSWORD"));

        bodyButton(wrapper, "INVALID_PASSWORD").trigger("click");

        expect(useSyncRunDialog().state.value).toEqual({
            visible: true,
            jobId: "run-1",
            expandConnectionId: "conn-b",
        });
    });

    it("keeps the action button outside the body button", async () => {
        const wrapper = await mountStrip(connection("TIMEOUT"));

        expect(bodyButton(wrapper, "TIMEOUT").find("button").exists()).toBe(false);
        expect(bodyButton(wrapper, "TIMEOUT").findAll("button")).toHaveLength(0);
    });
});
