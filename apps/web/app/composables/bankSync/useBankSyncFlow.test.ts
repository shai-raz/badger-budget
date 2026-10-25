import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref, type EffectScope } from "vue";
import { provideBankSyncFlow } from "./useBankSyncFlow";
import { SyncUnlockError } from "../../utils/syncPasskeyWebAuthn";

const mocks = vi.hoisted(() => ({
    full: vi.fn(),
    single: vi.fn(),
    unlock: vi.fn(),
    available: vi.fn(),
    addToast: vi.fn(),
    invalidate: vi.fn(),
}));
vi.mock("vue", async (original) => ({
    ...(await original<typeof import("vue")>()),
    provide: vi.fn(),
    onMounted: vi.fn(),
    onBeforeUnmount: vi.fn(),
    useId: () => "test",
}));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: mocks.addToast, removeGroup: vi.fn() }) }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("../../stores/auth", () => ({ useAuthStore: () => ({ user: { id: "user-1" } }) }));
vi.mock("./useSyncUnlock", () => ({
    useSyncUnlock: () => ({
        isWebAuthnAvailable: mocks.available,
        unlock: mocks.unlock,
        isPlatformAuthenticatorAvailable: async () => false,
        fetchPasskeys: async () => [],
        register: vi.fn(),
    }),
}));
vi.mock("./useBankSync", () => ({
    bankSyncKeys: { passkeys: () => ["bank-sync", "passkeys"] },
    useTriggerSyncMutation: () => ({ isPending: ref(false), mutateAsync: mocks.full }),
    useTriggerConnectionSyncMutation: () => ({ isPending: ref(false), mutateAsync: mocks.single }),
    useActiveSyncJobQuery: () => ({ data: ref(null), refetch: vi.fn() }),
    useSyncJobQuery: () => ({ data: ref(null) }),
    useSyncPasskeysQuery: () => ({ data: ref([{ credentialId: "passkey-1" }]) }),
}));

let scope: EffectScope;
let flow: ReturnType<typeof provideBankSyncFlow>;
beforeEach(() => {
    vi.resetAllMocks();
    mocks.full.mockResolvedValue({ jobId: "full-job" });
    mocks.single.mockResolvedValue({ jobId: "single-job" });
    mocks.unlock.mockResolvedValue("1234");
    mocks.available.mockReturnValue(false);
    scope = effectScope();
    flow = scope.run(() => provideBankSyncFlow())!;
});
afterEach(() => scope.stop());
const settle = async () => {
    for (let i = 0; i < 10; i++) await nextTick();
};

describe("shared bank sync flow", () => {
    it("syncs the selected connection using a typed PIN", async () => {
        flow.requestSync({ connectionId: "bank-1" });
        flow.pin.value = "1234";
        await flow.submitSync();
        expect(mocks.single).toHaveBeenCalledWith({
            connectionId: "bank-1",
            pin: "1234",
            defaultCurrencyCode: undefined,
        });
        expect(mocks.full).not.toHaveBeenCalled();
        expect(flow.activeJobId.value).toBe("single-job");
        expect(flow.pin.value).toBe("");
    });

    it("clears a cancelled selection before a header full sync", async () => {
        flow.requestSync({ connectionId: "bank-1" });
        flow.pin.value = "1234";
        flow.cancelSync();
        expect(flow.pin.value).toBe("");
        flow.requestSync({ defaultCurrencyCode: "ILS" });
        flow.pin.value = "5678";
        await flow.submitSync();
        expect(mocks.full).toHaveBeenCalledWith({ pin: "5678", defaultCurrencyCode: "ILS" });
        expect(mocks.single).not.toHaveBeenCalled();
    });

    it("retains the connection through passkey fallback and PIN submission", async () => {
        mocks.available.mockReturnValue(true);
        mocks.unlock.mockRejectedValue(new SyncUnlockError("cancelled"));
        flow.requestSync({ connectionId: "bank-2" });
        await settle();
        expect(flow.pinDialogVisible.value).toBe(true);
        flow.pin.value = "1234";
        await flow.submitSync();
        expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "bank-2", pin: "1234" }));
    });

    it("retains the target when trying the passkey again from the PIN dialog", async () => {
        flow.requestSync({ connectionId: "bank-2" });
        await nextTick();
        await flow.tryPasskeySync();
        expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "bank-2", pin: "1234" }));
    });

    it("uses the passkey directly from the connection menu", async () => {
        mocks.available.mockReturnValue(true);
        flow.requestSync({ connectionId: "bank-3" });
        await settle();
        expect(mocks.single).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "bank-3" }));
        expect(flow.pinDialogVisible.value).toBe(false);
    });

    it("keeps the target for a retry after a rejected submission", async () => {
        mocks.single.mockRejectedValueOnce(new Error("Network error"));
        flow.requestSync({ connectionId: "bank-1" });
        flow.pin.value = "1234";
        await flow.submitSync();
        expect(flow.pinDialogVisible.value).toBe(true);
        await flow.submitSync();
        expect(mocks.single).toHaveBeenLastCalledWith(expect.objectContaining({ connectionId: "bank-1" }));
    });

    it("blocks a second entry point during unlock and while a job runs", async () => {
        let resolvePin!: (pin: string) => void;
        mocks.available.mockReturnValue(true);
        mocks.unlock.mockImplementation(
            () =>
                new Promise<string>((resolve) => {
                    resolvePin = resolve;
                }),
        );
        flow.requestSync({ connectionId: "bank-1" });
        flow.requestSync();
        resolvePin("1234");
        await settle();
        flow.requestSync();
        expect(mocks.unlock).toHaveBeenCalledTimes(1);
        expect(mocks.single).toHaveBeenCalledTimes(1);
        expect(mocks.full).not.toHaveBeenCalled();
    });
});
