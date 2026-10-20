import { describe, expect, it } from "vitest";
import { sanitizeRedirectPath } from "./safeRedirect";

describe("sanitizeRedirectPath", () => {
    it.each(["/oauth/consent?request=abc", "/", "/settings", "/a/b:c"])("accepts %s", (v) => {
        expect(sanitizeRedirectPath(v)).toBe(v);
    });

    it.each([
        "//evil.com",
        "/\\evil.com",
        "https://evil.com",
        "javascript:alert(1)",
        "/a\nb",
        "/a\tb",
        "/a\\b",
        "",
        "relative/path",
        "/x:y",
        "/auth",
        "/auth/login",
        "/auth/login?redirect=/budgets",
        "/auth?x=1",
        "/" + "a".repeat(2048),
    ])("rejects %j", (v) => {
        expect(sanitizeRedirectPath(v)).toBeNull();
    });

    it("rejects non-strings and arrays", () => {
        expect(sanitizeRedirectPath(undefined)).toBeNull();
        expect(sanitizeRedirectPath(null)).toBeNull();
        expect(sanitizeRedirectPath(5)).toBeNull();
        expect(sanitizeRedirectPath(["/ok"])).toBeNull();
    });

    it("allows paths that merely start with auth", () => {
        expect(sanitizeRedirectPath("/authors")).toBe("/authors");
    });
});
