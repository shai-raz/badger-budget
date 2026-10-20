import {
    generateClientId,
    generateSecret,
    isValidCodeChallenge,
    safeEqual,
    sha256Hex,
    verifyPkceS256,
} from "./oauth-crypto";

describe("oauth-crypto", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    it("verifies the RFC 7636 vector", () => {
        expect(verifyPkceS256(verifier, challenge)).toBe(true);
    });
    it("rejects a wrong verifier", () => {
        expect(verifyPkceS256(verifier.replace("d", "e"), challenge)).toBe(false);
    });
    it("rejects a short verifier", () => {
        expect(verifyPkceS256("short", challenge)).toBe(false);
    });
    it("validates code challenge format", () => {
        expect(isValidCodeChallenge(challenge)).toBe(true);
        expect(isValidCodeChallenge("abc")).toBe(false);
        expect(isValidCodeChallenge(challenge + "=")).toBe(false);
    });
    it("generates prefixed secrets and client ids", () => {
        expect(generateSecret("bdg_at")).toMatch(/^bdg_at_[A-Za-z0-9_-]{43}$/);
        expect(generateSecret("bdg_rt")).toMatch(/^bdg_rt_/);
        expect(generateSecret("bdg_at")).not.toBe(generateSecret("bdg_at"));
        expect(generateClientId()).toMatch(/^mcp_[A-Za-z0-9_-]{22}$/);
    });
    it("hashes and compares", () => {
        expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        expect(safeEqual("a", "a")).toBe(true);
        expect(safeEqual("a", "b")).toBe(false);
        expect(safeEqual("a", "ab")).toBe(false);
    });
});
