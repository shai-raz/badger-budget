import { describe, expect, it } from "vitest";
import { randomBytes, unwrapPin, wrapPin } from "./syncPasskeyCrypto";

describe("syncPasskeyCrypto", () => {
    const prf = randomBytes(32);
    const salt = randomBytes(32);
    const cred = "cred-id-1";

    it.each(["123456", "pässwörd-日本語"])("round-trips %s", async (pin) => {
        const blob = await wrapPin(pin, prf, salt, cred);
        expect(await unwrapPin(blob, prf, salt, cred)).toBe(pin);
    });

    it("rejects a different prfOutput, salt or credentialId", async () => {
        const blob = await wrapPin("1234", prf, salt, cred);
        await expect(unwrapPin(blob, randomBytes(32), salt, cred)).rejects.toThrow();
        await expect(unwrapPin(blob, prf, randomBytes(32), cred)).rejects.toThrow();
        await expect(unwrapPin(blob, prf, salt, "other")).rejects.toThrow();
    });

    it("produces different IV and ciphertext per wrap", async () => {
        const a = await wrapPin("1234", prf, salt, cred);
        const b = await wrapPin("1234", prf, salt, cred);
        expect(a.wrappedPinIv).not.toBe(b.wrappedPinIv);
        expect(a.wrappedPinCt).not.toBe(b.wrappedPinCt);
    });

    it("encodes the IV to 16 chars", async () => {
        expect((await wrapPin("1234", prf, salt, cred)).wrappedPinIv).toHaveLength(16);
    });

    it("throws when prfOutput is not 32 bytes", async () => {
        await expect(wrapPin("1234", randomBytes(16), salt, cred)).rejects.toThrow();
    });
});
