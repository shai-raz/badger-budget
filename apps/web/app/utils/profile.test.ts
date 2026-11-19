import { describe, expect, it } from "vitest";
import { initialsOf } from "./profile";

describe("initialsOf", () => {
    it("uses the first letter of each name", () => {
        expect(initialsOf({ firstName: "demo", lastName: "user", email: "demo@demo.demo" })).toBe("DU");
    });

    it("uses the one letter when only one name is set", () => {
        expect(initialsOf({ firstName: "demo", lastName: null, email: "demo@demo.demo" })).toBe("D");
        expect(initialsOf({ firstName: "", lastName: "user" })).toBe("U");
    });

    it("falls back to the email's first letter when no names are set", () => {
        expect(initialsOf({ firstName: null, lastName: "", email: "shai@example.com" })).toBe("S");
    });

    it("is ? when there is nothing to go by", () => {
        expect(initialsOf({})).toBe("?");
        expect(initialsOf({ firstName: " ", lastName: null, email: null })).toBe("?");
    });
});
