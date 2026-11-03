import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import type { VueWrapper } from "@vue/test-utils";
import type { Ref } from "vue";
import SyncButton from "./SyncButton.vue";

const flow = vi.hoisted(() => ({
    activeJobId: null as Ref<string | null> | null,
    requestSync: vi.fn(),
}));

// The button reads the sync flow from the layout; here the flow is stubbed with settable refs.
vi.mock("../composables/bankSync/useBankSyncFlow", async () => {
    const { ref } = await import("vue");
    flow.activeJobId = ref<string | null>(null);
    return {
        useBankSyncFlow: () => ({
            activeJobId: flow.activeJobId,
            syncedCount: ref(null),
            buttonLoading: ref(false),
            busy: ref(false),
            requestSync: flow.requestSync,
        }),
    };
});

const mounted: VueWrapper[] = [];

async function mountButton(props: { failingCount?: number; iconOnly?: boolean } = {}) {
    const wrapper = await mountSuspended(SyncButton, { props });
    mounted.push(wrapper);
    return wrapper;
}

const dot = (wrapper: VueWrapper) => wrapper.find('span[aria-hidden="true"]');

beforeEach(() => {
    vi.clearAllMocks();
    flow.activeJobId!.value = null;
});

afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("SyncButton failing dot", () => {
    it("shows no dot and the plain label when no connection is failing", async () => {
        const wrapper = await mountButton({ failingCount: 0 });

        expect(dot(wrapper).exists()).toBe(false);
        expect(wrapper.find("button").attributes("aria-label")).toBeUndefined();
    });

    it("shows a dot and the one-connection label on the icon-only button", async () => {
        const wrapper = await mountButton({ failingCount: 1, iconOnly: true });

        expect(dot(wrapper).exists()).toBe(true);
        expect(wrapper.find("button").attributes("aria-label")).toBe("Sync, 1 connection failing");
    });

    it("keeps the Sync text and names the failing count on the labelled button", async () => {
        const wrapper = await mountButton({ failingCount: 2 });

        expect(dot(wrapper).exists()).toBe(true);
        expect(wrapper.find("button").text()).toContain("Sync");
        expect(wrapper.find("button").attributes("aria-label")).toBe("Sync, 2 connections failing");
    });

    it("shows no dot while a sync is running", async () => {
        flow.activeJobId!.value = "run-1";
        const wrapper = await mountButton({ failingCount: 3 });

        expect(dot(wrapper).exists()).toBe(false);
    });
});
