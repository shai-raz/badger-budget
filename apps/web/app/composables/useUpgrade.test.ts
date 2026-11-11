import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, ref, type EffectScope } from "vue";
import type { ISystemInfo } from "@badger/types";

import { PENDING_UPGRADE_KEY, type PendingUpgrade } from "~/utils/upgradeTracking";

// Nuxt auto-imports (useLocalStorage, useNow, useRuntimeConfig) are globals here, so each test stubs them. The
// stamped entry is built by hand: `liveAt` set and the build the upgrade started from still running, which is ready.
const BUILD_ID = "build-old";

const stored = ref<string | null>(null);
const info = ref<ISystemInfo | null>(null);
const auth = reactive<{ user: { id: string } | null }>({ user: { id: "u1" } });

const mocks = vi.hoisted(() => ({
    add: vi.fn(),
    removeGroup: vi.fn(),
    triggerUpgrade: vi.fn(),
}));

vi.mock("@tanstack/vue-query", () => ({
    // Runs the real mutationFn, so the tests exercise the code that records the upgrade.
    useMutation: (options: { mutationFn: () => Promise<unknown> }) => ({
        mutateAsync: () => options.mutationFn(),
        isPending: ref(false),
    }),
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: mocks.add, removeGroup: mocks.removeGroup }) }));
vi.mock("./useApiClient", () => ({ useApiClient: () => ({ triggerUpgrade: mocks.triggerUpgrade }) }));
vi.mock("./useUpdateNotice", () => ({ useUpdateNotice: () => ({ info }) }));
vi.mock("~/stores/auth", () => ({ useAuthStore: () => auth }));
vi.mock("~/utils/reloadToNewBuild", () => ({ reloadToNewBuild: vi.fn() }));

const stampedReady: PendingUpgrade = {
    userId: "u1",
    targetVersion: "1.2.0",
    fromVersion: "1.1.0",
    fromBuildId: BUILD_ID,
    startedAt: 1_000,
    liveAt: 2_000,
};

let scopes: EffectScope[] = [];

/** Runs `useUpgrade` in its own scope, as a component's setup would. */
const mountUpgrade = async () => {
    const { useUpgrade } = await import("./useUpgrade");
    const scope = effectScope();
    scopes.push(scope);
    return scope.run(() => useUpgrade())!;
};

beforeEach(() => {
    vi.resetModules();
    stored.value = null;
    info.value = null;
    auth.user = { id: "u1" };
    mocks.add.mockReset();
    mocks.removeGroup.mockReset();
    mocks.triggerUpgrade.mockReset();
    vi.stubGlobal("useLocalStorage", (key: string) => {
        expect(key).toBe(PENDING_UPGRADE_KEY);
        return stored;
    });
    vi.stubGlobal("useNow", () => ref(new Date(3_000)));
    vi.stubGlobal("useRuntimeConfig", () => ({ app: { buildId: BUILD_ID } }));
});

afterEach(() => {
    scopes.forEach((scope) => scope.stop());
    scopes = [];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("useUpgrade", () => {
    // Regression: the watcher wrote `held` on every run, a fresh object each time, so it re-triggered itself until the
    // tab froze. Vue's dev build throws "Maximum recursive updates exceeded" from the flush, which vitest reports as an
    // unhandled error and fails the run.
    it("settles at ready on a stamped entry without re-triggering its own watcher", async () => {
        stored.value = JSON.stringify(stampedReady);

        const upgrade = await mountUpgrade();
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(upgrade.phase.value).toBe("ready");
        expect(upgrade.pending.value?.targetVersion).toBe("1.2.0");
    });

    // Regression: `held` was per call, so a consumer mounted after another tab cleared the shared entry lost ready.
    it("keeps ready for a consumer mounted after another tab cleared the shared entry", async () => {
        stored.value = JSON.stringify(stampedReady);
        const first = await mountUpgrade();
        await nextTick();
        expect(first.phase.value).toBe("ready");

        // Another tab reached done and cleared the shared entry.
        stored.value = null;
        const later = await mountUpgrade();
        await nextTick();

        expect(later.pending.value?.targetVersion).toBe("1.2.0");
        expect(later.phase.value).toBe("ready");
    });

    // Regression: `held` is module scope and was passed to tabView unchecked, so after a sign-out the next user in the
    // same tab read the previous user's "Reload to vX" state.
    it("drops a copy held for the previous user after sign-out", async () => {
        stored.value = JSON.stringify(stampedReady);
        const upgrade = await mountUpgrade();
        await nextTick();
        expect(upgrade.phase.value).toBe("ready");

        // Sign-out clears the shared entry, then another user signs in in the same tab.
        stored.value = null;
        auth.user = { id: "u2" };
        await nextTick();

        expect(upgrade.phase.value).toBeNull();
        expect(upgrade.pending.value).toBeNull();

        const nextUser = await mountUpgrade();
        await nextTick();
        expect(nextUser.phase.value).toBeNull();
    });
});

describe("useUpgrade.startUpgrade", () => {
    const available: ISystemInfo = {
        version: "1.1.0",
        commit: null,
        latest: "1.2.0",
        updateAvailable: true,
        updateComparable: true,
        checkedAt: null,
        updateCheckEnabled: true,
        upgradeAvailable: true,
        releaseUrl: null,
    };

    beforeEach(() => {
        info.value = available;
    });

    it("starts the upgrade, records it, and shows the progress toast", async () => {
        mocks.triggerUpgrade.mockResolvedValue({ targetVersion: "1.2.0" });
        const upgrade = await mountUpgrade();

        await expect(upgrade.startUpgrade()).resolves.toBe("started");

        expect(mocks.triggerUpgrade).toHaveBeenCalledTimes(1);
        expect(JSON.parse(stored.value!)).toMatchObject({
            userId: "u1",
            targetVersion: "1.2.0",
            fromVersion: "1.1.0",
            fromBuildId: BUILD_ID,
        });
        expect(mocks.removeGroup).toHaveBeenCalledWith("upgrade");
        expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ summary: "Upgrading to v1.2.0" }));
    });

    it("falls back to the latest release when the host reports no target", async () => {
        mocks.triggerUpgrade.mockResolvedValue({ targetVersion: null });
        const upgrade = await mountUpgrade();

        await upgrade.startUpgrade();

        expect(upgrade.pending.value?.targetVersion).toBe("1.2.0");
    });

    // A 409 means the server already has an upgrade running: this browser tracks it like one it started.
    it("tracks an upgrade the server already has running on 409", async () => {
        mocks.triggerUpgrade.mockRejectedValue({ response: { status: 409, data: { message: "busy" } } });
        const upgrade = await mountUpgrade();

        await expect(upgrade.startUpgrade()).resolves.toBe("in-progress");

        expect(JSON.parse(stored.value!)).toMatchObject({ userId: "u1", targetVersion: "1.2.0", fromVersion: "1.1.0" });
        expect(upgrade.phase.value).toBe("upgrading");
        expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ summary: "Upgrading to v1.2.0" }));
    });

    it("shows the server's message and records nothing on other errors", async () => {
        mocks.triggerUpgrade.mockRejectedValue({
            response: { status: 502, data: { message: "Could not reach the deploy webhook" } },
        });
        const upgrade = await mountUpgrade();

        await expect(upgrade.startUpgrade()).resolves.toBe("failed");

        expect(stored.value).toBeNull();
        expect(mocks.add).toHaveBeenCalledWith(
            expect.objectContaining({
                severity: "error",
                summary: "Upgrade failed",
                detail: "Could not reach the deploy webhook",
            }),
        );
    });

    it("fails without calling the host when no one is signed in", async () => {
        auth.user = null;
        const upgrade = await mountUpgrade();

        await expect(upgrade.startUpgrade()).resolves.toBe("failed");

        expect(mocks.triggerUpgrade).not.toHaveBeenCalled();
        expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ detail: "Could not start the upgrade" }));
    });
});
