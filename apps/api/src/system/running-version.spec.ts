import { readFileSync } from "fs";
import { resolve } from "path";
import { readApiPackageVersion, resolveRunningVersion } from "./running-version";

describe("resolveRunningVersion", () => {
    const noPackage = () => null;

    it("uses APP_VERSION with the leading v stripped", () => {
        expect(resolveRunningVersion({ APP_VERSION: "v0.3.1" }, noPackage)).toEqual({
            version: "0.3.1",
            commit: null,
        });
    });

    it("falls back to the package version with a -dev suffix when APP_VERSION is blank or missing", () => {
        const readPackage = () => "0.1.0";
        expect(resolveRunningVersion({ APP_VERSION: "   " }, readPackage)).toEqual({
            version: "0.1.0-dev",
            commit: null,
        });
        expect(resolveRunningVersion({}, readPackage)).toEqual({ version: "0.1.0-dev", commit: null });
    });

    it("returns a null version when neither APP_VERSION nor the package version is available", () => {
        expect(resolveRunningVersion({}, noPackage)).toEqual({ version: null, commit: null });
        expect(resolveRunningVersion({ APP_VERSION: "" }, () => "  ")).toEqual({ version: null, commit: null });
    });

    it("returns the trimmed GIT_SHA as the commit", () => {
        expect(resolveRunningVersion({ APP_VERSION: "0.3.1", GIT_SHA: " abc123 \n" }, noPackage)).toEqual({
            version: "0.3.1",
            commit: "abc123",
        });
    });

    it("treats a whitespace-only or empty GIT_SHA as unset", () => {
        expect(resolveRunningVersion({ APP_VERSION: "0.3.1", GIT_SHA: "   " }, noPackage).commit).toBeNull();
        expect(resolveRunningVersion({ APP_VERSION: "0.3.1", GIT_SHA: "" }, noPackage).commit).toBeNull();
    });
});

describe("readApiPackageVersion", () => {
    it("reads the version from apps/api/package.json", () => {
        const expected = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")).version;
        expect(readApiPackageVersion()).toBe(expected);
    });
});
