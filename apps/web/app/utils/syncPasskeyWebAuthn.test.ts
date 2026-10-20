import { afterEach, describe, expect, it, vi } from "vitest";
import { toBase64Url } from "./base64url";
import {
    createPrfPasskey,
    getPrfOutputForAny,
    STALE_PIN_MESSAGE,
    SyncUnlockError,
    UNSUPPORTED_MESSAGE,
    unlockFallbackMessage,
} from "./syncPasskeyWebAuthn";

afterEach(() => vi.unstubAllGlobals());

const buf = (n: number, fill = 1) => new Uint8Array(n).fill(fill).buffer;
const opts = { userId: "u1", userName: "a@b.c", displayName: "A", excludeCredentialIds: [] as string[] };

function fakeCred(rawId: ArrayBuffer, prf: unknown) {
    return { rawId, getClientExtensionResults: () => ({ prf }) };
}
function stub() {
    return { create: vi.fn(), get: vi.fn() };
}
const asCreds = (c: ReturnType<typeof stub>) => c as unknown as CredentialsContainer;
async function reasonOf(p: Promise<unknown>) {
    try {
        await p;
    } catch (e) {
        expect(e).toBeInstanceOf(SyncUnlockError);
        return (e as SyncUnlockError).reason;
    }
    return undefined;
}

describe("createPrfPasskey", () => {
    it("uses create results without a get call", async () => {
        const c = stub();
        const raw = new Uint8Array([1, 2, 3]).buffer;
        c.create.mockResolvedValue(fakeCred(raw, { results: { first: buf(32, 7) } }));
        const r = await createPrfPasskey(asCreds(c), opts);
        expect(c.get).not.toHaveBeenCalled();
        expect(r.credentialId).toBe(toBase64Url(raw));
        expect(r.prfOutput).toEqual(new Uint8Array(32).fill(7));
        expect(r.prfSalt.length).toBe(32);
    });

    it("falls back to get when only enabled", async () => {
        const c = stub();
        const raw = new Uint8Array([9]).buffer;
        c.create.mockResolvedValue(fakeCred(raw, { enabled: true }));
        c.get.mockResolvedValue(fakeCred(raw, { results: { first: buf(32, 5) } }));
        const r = await createPrfPasskey(asCreds(c), opts);
        expect(c.get).toHaveBeenCalledTimes(1);
        const salt = c.get.mock.calls[0]![0].publicKey.extensions.prf.eval.first;
        expect(new Uint8Array(salt)).toEqual(r.prfSalt);
        expect(r.prfOutput).toEqual(new Uint8Array(32).fill(5));
    });

    it("is unsupported when prf not enabled", async () => {
        const signal = vi.fn();
        vi.stubGlobal("PublicKeyCredential", { signalUnknownCredential: signal });
        vi.stubGlobal("location", { hostname: "localhost" });
        const c = stub();
        c.create.mockResolvedValue(fakeCred(buf(4), { enabled: false }));
        expect(await reasonOf(createPrfPasskey(asCreds(c), opts))).toBe("unsupported");
        expect(signal).toHaveBeenCalled();
    });

    it("signals the orphan passkey when the follow-up get is cancelled", async () => {
        const signal = vi.fn();
        vi.stubGlobal("PublicKeyCredential", { signalUnknownCredential: signal });
        vi.stubGlobal("location", { hostname: "localhost" });
        const c = stub();
        const raw = new Uint8Array([4, 5]).buffer;
        c.create.mockResolvedValue(fakeCred(raw, { enabled: true }));
        c.get.mockRejectedValue(new DOMException("", "NotAllowedError"));
        expect(await reasonOf(createPrfPasskey(asCreds(c), opts))).toBe("cancelled");
        expect(signal).toHaveBeenCalledWith({ rpId: "localhost", credentialId: toBase64Url(raw) });
    });

    it("maps a null create to cancelled", async () => {
        const c = stub();
        c.create.mockResolvedValue(null);
        expect(await reasonOf(createPrfPasskey(asCreds(c), opts))).toBe("cancelled");
    });

    it("maps DOMExceptions", async () => {
        const c = stub();
        c.create.mockRejectedValueOnce(new DOMException("", "NotAllowedError"));
        expect(await reasonOf(createPrfPasskey(asCreds(c), opts))).toBe("cancelled");
        c.create.mockRejectedValueOnce(new DOMException("", "InvalidStateError"));
        expect(await reasonOf(createPrfPasskey(asCreds(c), opts))).toBe("already-registered");
    });
});

describe("getPrfOutputForAny", () => {
    it("builds per-credential eval and picks the matching rawId", async () => {
        const c = stub();
        const a = new Uint8Array([1, 1]);
        const b = new Uint8Array([2, 2]);
        const salt = (n: number) => toBase64Url(new Uint8Array(32).fill(n));
        const list = [
            { credentialId: toBase64Url(a), prfSalt: salt(1) },
            { credentialId: toBase64Url(b), prfSalt: salt(2) },
        ];
        c.get.mockResolvedValue(fakeCred(b.buffer, { results: { first: buf(32, 3) } }));
        const r = await getPrfOutputForAny(asCreds(c), list);
        const pk = c.get.mock.calls[0]![0].publicKey;
        expect(pk.allowCredentials).toHaveLength(2);
        expect(Object.keys(pk.extensions.prf.evalByCredential)).toEqual(list.map((p) => p.credentialId));
        expect(r.credentialId).toBe(list[1]!.credentialId);
        expect(r.prfOutput).toEqual(new Uint8Array(32).fill(3));
    });

    it("rejects an empty list", async () => {
        expect(await reasonOf(getPrfOutputForAny(asCreds(stub()), []))).toBe("no-passkeys");
    });
});

describe("unlockFallbackMessage", () => {
    it("maps SyncUnlockError reasons to fallback text", () => {
        expect(unlockFallbackMessage(new SyncUnlockError("unsupported"), false)).toBe(UNSUPPORTED_MESSAGE);
        expect(unlockFallbackMessage(new SyncUnlockError("failed"), false)).toBe("Couldn't unlock with passkey.");
        expect(unlockFallbackMessage(new SyncUnlockError("stale-pin"), false)).toBe(STALE_PIN_MESSAGE);
        expect(unlockFallbackMessage(new SyncUnlockError("cancelled"), false)).toMatch(/cancelled/);
        expect(unlockFallbackMessage(new SyncUnlockError("no-passkeys"), false)).toMatch(/cancelled/);
    });

    it("treats a 401 as stale only for a passkey-derived PIN", () => {
        const e401 = { response: { status: 401 } };
        expect(unlockFallbackMessage(e401, true)).toBe(STALE_PIN_MESSAGE);
        expect(unlockFallbackMessage(e401, false)).toBeNull();
    });

    it("returns null for other errors", () => {
        expect(unlockFallbackMessage({ response: { status: 500 } }, true)).toBeNull();
        expect(unlockFallbackMessage(new Error("x"), true)).toBeNull();
        expect(unlockFallbackMessage(null, true)).toBeNull();
    });
});
