import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSyncUnlock } from "./useSyncUnlock";

const registerSyncPasskey = vi.fn();
const createPrfPasskey = vi.fn();
const signalUnknown = vi.fn();
const wrapPin = vi.fn();
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
vi.mock("../../utils/syncPasskeyCrypto", () => ({ wrapPin: (...a: unknown[]) => wrapPin(...a), unwrapPin: vi.fn() }));
vi.mock("../../utils/deviceLabel", () => ({ describeDevice: () => "Test device" }));
vi.mock("../../utils/syncPasskeyDeviceFlags", () => ({ markRegisteredOnDevice: vi.fn() }));
vi.mock("../../utils/syncPasskeyWebAuthn", async (orig) => ({
    ...(await orig<typeof import("../../utils/syncPasskeyWebAuthn")>()),
    createPrfPasskey: (...a: unknown[]) => createPrfPasskey(...a),
    signalUnknown: (...a: unknown[]) => signalUnknown(...a),
    getPrfOutputForAny: (...a: unknown[]) => getPrfOutputForAny(...a),
}));

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { isSecureContext: true, PublicKeyCredential: {} });
    vi.stubGlobal("navigator", { credentials: {}, userAgent: "ua" });
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
});
