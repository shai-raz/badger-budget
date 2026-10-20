import { describe, expect, it } from "vitest";
import { getApiErrorMessage, getErrorMessage } from "./apiError";

describe("getApiErrorMessage", () => {
    it("returns a string message", () => {
        expect(getApiErrorMessage({ response: { data: { message: "Bad" } } }, "fb")).toBe("Bad");
    });
    it("joins an array of messages", () => {
        expect(getApiErrorMessage({ response: { data: { message: ["a", "b"] } } }, "fb")).toBe("a, b");
    });
    it("falls back on an empty string or empty array", () => {
        expect(getApiErrorMessage({ response: { data: { message: "" } } }, "fb")).toBe("fb");
        expect(getApiErrorMessage({ response: { data: { message: [] } } }, "fb")).toBe("fb");
    });
    it("falls back when response is missing", () => {
        expect(getApiErrorMessage({}, "fb")).toBe("fb");
        expect(getApiErrorMessage({ response: {} }, "fb")).toBe("fb");
    });
    it("falls back for non-object errors", () => {
        expect(getApiErrorMessage("boom", "fb")).toBe("fb");
        expect(getApiErrorMessage(undefined, "fb")).toBe("fb");
        expect(getApiErrorMessage(null, "fb")).toBe("fb");
    });
});

describe("getErrorMessage", () => {
    it("returns the Error message", () => {
        expect(getErrorMessage(new Error("oops"), "fb")).toBe("oops");
    });
    it("falls back for empty message or non-Error", () => {
        expect(getErrorMessage(new Error(""), "fb")).toBe("fb");
        expect(getErrorMessage("oops", "fb")).toBe("fb");
    });
});
