import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, reactive, ref, type EffectScope } from "vue";
import type { ISystemInfo } from "@badger/types";
import type { UpgradePhase } from "~/utils/upgradeTracking";

// Nuxt auto-imports (useRoute, useRouter) are globals here. `replace` mirrors the router by writing the new query back
// to the route, which is what makes the watcher see the param disappear.
const route = reactive<{ query: Record<string, unknown> }>({ query: {} });
const replace = vi.fn(async (location: { query: Record<string, unknown> }) => {
    route.query = location.query;
});

const auth = reactive({ isAuthenticated: true });
const phase = ref<UpgradePhase | null>(null);
const pending = ref<{ targetVersion: string | null } | null>(null);
const refetch = vi.fn();
const openDialog = vi.fn();
const startUpgrade = vi.fn();
const showStarted = vi.fn();
const removeGroup = vi.fn();

vi.mock("./useSystemInfo", () => ({ useSystemInfo: () => ({ refetch }) }));
vi.mock("./useUpdateDialog", () => ({ useUpdateDialog: () => ({ openDialog }) }));
vi.mock("./useUpgrade", () => ({
    UPGRADE_TOAST_GROUP: "upgrade",
    useUpgrade: () => ({ phase, pending, startUpgrade, showStarted }),
}));
vi.mock("~/stores/auth", () => ({ useAuthStore: () => auth }));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ removeGroup, add: vi.fn() }) }));

const serverInfo = (overrides: Partial<ISystemInfo> = {}): ISystemInfo => ({
    version: "1.1.0",
    commit: null,
    latest: "1.2.0",
    updateAvailable: true,
    updateComparable: true,
    checkedAt: null,
    updateCheckEnabled: true,
    upgradeAvailable: true,
    releaseUrl: null,
    ...overrides,
});

let scopes: EffectScope[] = [];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Runs `useUpdateRouteTrigger` in its own scope, as the layout's setup would. */
const mountTrigger = async () => {
    const { useUpdateRouteTrigger } = await import("./useUpdateRouteTrigger");
    const scope = effectScope();
    scopes.push(scope);
    scope.run(() => useUpdateRouteTrigger());
    await settle();
};

beforeEach(() => {
    vi.resetModules();
    route.query = {};
    auth.isAuthenticated = true;
    phase.value = null;
    pending.value = null;
    replace.mockClear();
    refetch.mockReset();
    refetch.mockResolvedValue({ data: serverInfo() });
    openDialog.mockReset();
    startUpgrade.mockReset();
    startUpgrade.mockResolvedValue("started");
    showStarted.mockReset();
    removeGroup.mockReset();
    vi.stubGlobal("useRoute", () => route);
    vi.stubGlobal("useRouter", () => ({ replace }));
});

afterEach(() => {
    scopes.forEach((scope) => scope.stop());
    scopes = [];
    vi.unstubAllGlobals();
});

describe("useUpdateRouteTrigger", () => {
    it("removes the param before the fresh info is fetched", async () => {
        route.query = { update: "open", tab: "keep" };
        let resolveRefetch: (value: { data: ISystemInfo }) => void = () => undefined;
        let updateWhenRefetched: unknown = "not fetched";
        refetch.mockImplementation(() => {
            updateWhenRefetched = route.query.update;
            return new Promise((resolve) => (resolveRefetch = resolve));
        });

        await mountTrigger();

        expect(replace).toHaveBeenCalledWith({ query: { tab: "keep" } });
        expect(updateWhenRefetched).toBeUndefined();
        expect(openDialog).not.toHaveBeenCalled();

        resolveRefetch({ data: serverInfo() });
        await settle();
        expect(openDialog).toHaveBeenCalledTimes(1);
    });

    it("opens the dialog for open", async () => {
        route.query = { update: "open" };

        await mountTrigger();

        expect(openDialog).toHaveBeenCalledTimes(1);
        expect(startUpgrade).not.toHaveBeenCalled();
    });

    it("starts the upgrade once for upgrade when the action is enabled", async () => {
        // The replace is held back here, so the param stays on the route after the first run: unrelated query changes
        // must not run the trigger again.
        replace.mockImplementationOnce(async () => undefined);
        route.query = { update: "upgrade" };

        await mountTrigger();
        route.query = { update: "upgrade", other: "1" };
        await settle();

        expect(startUpgrade).toHaveBeenCalledTimes(1);
        expect(openDialog).not.toHaveBeenCalled();
    });

    it("tracks an upgrade already in flight, replacing the old progress toast", async () => {
        phase.value = "upgrading";
        pending.value = { targetVersion: "1.2.0" };
        route.query = { update: "upgrade" };

        await mountTrigger();

        expect(startUpgrade).not.toHaveBeenCalled();
        expect(removeGroup).toHaveBeenCalledWith("upgrade");
        expect(showStarted).toHaveBeenCalledWith("1.2.0");
    });

    // Non-admins and instances without the deploy webhook get no Upgrade action, so the link does nothing.
    it("ignores upgrade when the Upgrade action is hidden", async () => {
        refetch.mockResolvedValue({ data: serverInfo({ upgradeAvailable: false }) });
        route.query = { update: "upgrade" };

        await mountTrigger();

        expect(replace).toHaveBeenCalledTimes(1);
        expect(startUpgrade).not.toHaveBeenCalled();
        expect(openDialog).not.toHaveBeenCalled();
        expect(showStarted).not.toHaveBeenCalled();
    });

    it("ignores upgrade when the fresh info cannot be read", async () => {
        refetch.mockResolvedValue({ data: undefined });
        route.query = { update: "upgrade" };

        await mountTrigger();

        expect(startUpgrade).not.toHaveBeenCalled();
    });

    it("consumes the param but does not fetch or act when signed out", async () => {
        auth.isAuthenticated = false;
        route.query = { update: "upgrade" };

        await mountTrigger();

        expect(replace).toHaveBeenCalledWith({ query: {} });
        expect(refetch).not.toHaveBeenCalled();
        expect(startUpgrade).not.toHaveBeenCalled();
    });

    it("leaves unknown values alone", async () => {
        route.query = { update: "maybe" };

        await mountTrigger();

        expect(replace).not.toHaveBeenCalled();
        expect(refetch).not.toHaveBeenCalled();
    });
});
