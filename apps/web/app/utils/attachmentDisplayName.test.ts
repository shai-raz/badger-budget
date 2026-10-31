import { describe, expect, it } from "vitest";
import { middleTruncateFileName } from "./attachmentDisplayName";

const LONE_HIGH_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/;

describe("middleTruncateFileName", () => {
    it("leaves a short name unchanged", () => {
        expect(middleTruncateFileName("Receipt.pdf")).toBe("Receipt.pdf");
    });

    it("leaves a name of exactly 40 code points unchanged", () => {
        const exact = `${"a".repeat(36)}.pdf`;
        expect(Array.from(exact)).toHaveLength(40);
        expect(middleTruncateFileName(exact)).toBe(exact);
    });

    it("keeps the start and the extension with the last base characters of a long name", () => {
        const name = `${"Receipt_from_the_hardware_store_".repeat(4)}_2026.pdf`;
        const result = middleTruncateFileName(name);
        expect(Array.from(result).length).toBeLessThanOrEqual(40);
        expect(result.endsWith("__2026.pdf")).toBe(true);
        expect(result.startsWith(name.slice(0, 20))).toBe(true);
        expect(result).toContain("…");
    });

    it("truncates a long name without an extension and keeps its last six characters", () => {
        const name = `${"abcdefghij".repeat(12)}XYZUVW`;
        const result = middleTruncateFileName(name);
        expect(Array.from(result).length).toBeLessThanOrEqual(40);
        expect(result.endsWith("XYZUVW")).toBe(true);
        expect(result).toContain("…");
    });

    it("never splits an astral character into a lone surrogate", () => {
        const name = `${"😀".repeat(60)}.png`;
        const result = middleTruncateFileName(name);
        expect(result).toBe(Array.from(result).join(""));
        expect(LONE_HIGH_SURROGATE.test(result)).toBe(false);
        expect(Array.from(result).length).toBeLessThanOrEqual(40);
        expect(result.endsWith(".png")).toBe(true);
    });

    it("honours a custom maxLength", () => {
        const name = `${"x".repeat(50)}_final.docx`;
        const result = middleTruncateFileName(name, 20);
        expect(Array.from(result).length).toBeLessThanOrEqual(20);
        expect(result.endsWith("_final.docx")).toBe(true);
        expect(result).toContain("…");
    });
});
