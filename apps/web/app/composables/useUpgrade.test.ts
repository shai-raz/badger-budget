import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref, type EffectScope } from "vue";

import { PENDING_UPGRADE_KEY, type PendingUpgrade } from "~/utils/upgradeTracking";

// Nuxt auto-imports (useLocalStorage, useNow, useRuntimeConfig) are globals here, so each test stubs them. The
// stamped entry is built by hand: `liveAt` set and the build the upgrade started from still running, which is ready.
const BUILD_ID = "build-old";

const stored = ref<string | null>(null);
const info = ref(null);

vi.mock("@tanstack/vue-query", () => ({
    useMutation: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock("./useApiClient", () => ({ useApiClient: () => ({ triggerUpgrade: vi.fn() }) }));
vi.mock("./useUpdateNotice", () => ({ useUpdateNotice: () => ({ info }) }));
vi.mock("~/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u1" } }) }));
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
});
