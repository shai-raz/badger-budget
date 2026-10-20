import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "./base64url";

describe("base64url", () => {
    it.each([0, 1, 2, 3, 16, 32, 33])("round-trips %i random bytes", (n) => {
        const bytes = crypto.getRandomValues(new Uint8Array(n));
        const encoded = toBase64Url(bytes);
        expect(encoded).not.toMatch(/[+/=]/);
        expect(Array.from(fromBase64Url(encoded))).toEqual(Array.from(bytes));
    });

    it("encodes a known vector using - and _", () => {
        expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
        expect(Array.from(fromBase64Url("-_8"))).toEqual([0xfb, 0xff]);
    });

    it("accepts an ArrayBuffer", () => {
        expect(toBase64Url(new Uint8Array([1, 2, 3]).buffer)).toBe("AQID");
    });
});
