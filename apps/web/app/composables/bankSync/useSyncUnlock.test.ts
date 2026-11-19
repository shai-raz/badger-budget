import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSyncUnlock } from "./useSyncUnlock";
import { getDeviceCredentialId, setDeviceCredentialId } from "../../utils/syncPasskeyDeviceFlags";

const registerSyncPasskey = vi.fn();
const createPrfPasskey = vi.fn();
const signalUnknown = vi.fn();
const wrapPin = vi.fn();
const unwrapPin = vi.fn();
const getSyncPasskeys = vi.fn(async () => []);
const getPrfOutputForAny = vi.fn();

vi.mock("@tanstack/vue-query", () => ({
    useQueryClient: () => ({
        fetchQuery: async () => [],
        invalidateQueries: async () => {},
    }),
}));
vi.mock("../useApiClient", () => ({
    useApiClient: () => ({ registerSyncPasskey, getSyncPasskeys: () => getSyncPasskeys() }),
}));
vi.mock("../../stores/auth", () => ({
    useAuthStore: () => ({ user: { id: "u1", email: "a@b.c", firstName: "A", lastName: "B" } }),
}));
vi.mock("./useBankSync", () => ({ bankSyncKeys: { passkeys: () => ["passkeys"] } }));
vi.mock("../../utils/syncPasskeyCrypto", () => ({
    wrapPin: (...a: unknown[]) => wrapPin(...a),
    unwrapPin: (...a: unknown[]) => unwrapPin(...a),
}));
vi.mock("../../utils/deviceLabel", () => ({ describeDevice: () => "Test device" }));
vi.mock("../../utils/syncPasskeyWebAuthn", async (orig) => ({
    ...(await orig<typeof import("../../utils/syncPasskeyWebAuthn")>()),
    createPrfPasskey: (...a: unknown[]) => createPrfPasskey(...a),
    signalUnknown: (...a: unknown[]) => signalUnknown(...a),
    getPrfOutputForAny: (...a: unknown[]) => getPrfOutputForAny(...a),
}));

function memoryStorage() {
    const m = new Map<string, string>();
    return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
        removeItem: (k: string) => void m.delete(k),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { isSecureContext: true, PublicKeyCredential: {} });
    vi.stubGlobal("navigator", { credentials: {}, userAgent: "ua" });
    vi.stubGlobal("localStorage", memoryStorage());
    createPrfPasskey.mockResolvedValue({
        credentialId: "cred1",
        prfSalt: new Uint8Array(32),
        prfOutput: new Uint8Array(32),
    });
    wrapPin.mockResolvedValue({ wrappedPin: "w", wrapIv: "iv" });
});

describe("register", () => {
    it("rethrows API errors with their response and signals the orphan credential", async () => {
        const apiErr = Object.assign(new Error("Request failed"), { response: { status: 401 } });
        registerSyncPasskey.mockRejectedValue(apiErr);
        await expect(useSyncUnlock().register("1234")).rejects.toMatchObject({ response: { status: 401 } });
        expect(signalUnknown).toHaveBeenCalledWith("cred1");
    });

    it("does not signal when the credential was never created", async () => {
        createPrfPasskey.mockRejectedValue(new Error("boom"));
        await expect(useSyncUnlock().register("1234")).rejects.toBeTruthy();
        expect(signalUnknown).not.toHaveBeenCalled();
    });

    it("remembers the new credential id on this device after a successful register", async () => {
        registerSyncPasskey.mockResolvedValue({ id: "p1" });
        await useSyncUnlock().register("1234");
        expect(getDeviceCredentialId("u1")).toBe("cred1");
    });

    it("does not remember a credential id when the server rejects the register", async () => {
        registerSyncPasskey.mockRejectedValue(new Error("boom"));
        await expect(useSyncUnlock().register("1234")).rejects.toBeTruthy();
        expect(getDeviceCredentialId("u1")).toBeNull();
    });
});

describe("register with a known list", () => {
    it("does not fetch and excludes the known credentials", async () => {
        registerSyncPasskey.mockResolvedValue({ id: "p1" });
        const known = [{ credentialId: "old", prfSalt: "s" }] as never;
        await useSyncUnlock().register("1234", known);
        expect(createPrfPasskey).toHaveBeenCalledWith(
            navigator.credentials,
            expect.objectContaining({ excludeCredentialIds: ["old"] }),
        );
    });
});

describe("unlock", () => {
    it("uses the known list without fetching, so credentials.get is the first await (Safari activation)", async () => {
        getPrfOutputForAny.mockRejectedValue(new Error("stop"));
        const known = [{ credentialId: "cred1", prfSalt: "s" }] as never;
        await expect(useSyncUnlock().unlock(known)).rejects.toBeTruthy();
        expect(getSyncPasskeys).not.toHaveBeenCalled();
        expect(getPrfOutputForAny).toHaveBeenCalledWith(navigator.credentials, known);
    });

    it("remembers the unlocking credential id after a successful unlock", async () => {
        getPrfOutputForAny.mockResolvedValue({ credentialId: "cred2", prfOutput: new Uint8Array(32) });
        unwrapPin.mockResolvedValue("1234");
        const known = [
            { credentialId: "cred1", prfSalt: "AAAA" },
            { credentialId: "cred2", prfSalt: "AAAA" },
        ] as never;
        await expect(useSyncUnlock().unlock(known)).resolves.toBe("1234");
        expect(getDeviceCredentialId("u1")).toBe("cred2");
    });

    it("leaves the remembered credential id unchanged after a failed unlock", async () => {
        getPrfOutputForAny.mockResolvedValue({ credentialId: "cred1", prfOutput: new Uint8Array(32) });
        unwrapPin.mockRejectedValue(new Error("bad key"));
        setDeviceCredentialId("u1", "previous");
        const known = [{ credentialId: "cred1", prfSalt: "AAAA" }] as never;
        await expect(useSyncUnlock().unlock(known)).rejects.toBeTruthy();
        expect(getDeviceCredentialId("u1")).toBe("previous");
    });
});
