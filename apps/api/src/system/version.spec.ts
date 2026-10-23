import { baseVersion, compareBase, isUpdateAvailable, normalizeVersion, parseVersion } from "./version";

describe("parseVersion", () => {
    it("parses release, git-describe ahead and dev builds", () => {
        expect(parseVersion("0.3.1")).toEqual({ base: [0, 3, 1], kind: "release" });
        expect(parseVersion("v0.3.1")).toEqual({ base: [0, 3, 1], kind: "release" });
        expect(parseVersion("0.3.1-3-gabc1234")).toEqual({ base: [0, 3, 1], kind: "ahead" });
        expect(parseVersion("v0.3.1-12-gDEADbeef")).toEqual({ base: [0, 3, 1], kind: "ahead" });
        expect(parseVersion("0.3.0-dev")).toEqual({ base: [0, 3, 0], kind: "dev" });
    });

    it("trims whitespace around the version", () => {
        expect(parseVersion("  0.3.1 \n")).toEqual({ base: [0, 3, 1], kind: "release" });
    });

    it("returns null for unknown, empty or garbage input", () => {
        expect(parseVersion(null)).toBeNull();
        expect(parseVersion(undefined)).toBeNull();
        expect(parseVersion("")).toBeNull();
        expect(parseVersion("latest")).toBeNull();
        expect(parseVersion("0.3")).toBeNull();
        expect(parseVersion("0.3.1-rc1")).toBeNull();
        expect(parseVersion("0.3.1-3-gxyz")).toBeNull();
    });
});

describe("compareBase", () => {
    it("compares major, minor and patch in order", () => {
        expect(compareBase([0, 9, 4], [1, 0, 0])).toBe(-1);
        expect(compareBase([1, 0, 0], [0, 9, 9])).toBe(1);
        expect(compareBase([0, 3, 1], [0, 3, 1])).toBe(0);
        expect(compareBase([0, 3, 9], [0, 4, 0])).toBe(-1);
    });
});

describe("baseVersion", () => {
    it("returns X.Y.Z for parsable builds and null otherwise", () => {
        expect(baseVersion("v0.3.1-3-gabc1234")).toBe("0.3.1");
        expect(baseVersion("0.3.0-dev")).toBe("0.3.0");
        expect(baseVersion("nope")).toBeNull();
        expect(baseVersion(null)).toBeNull();
    });
});

describe("normalizeVersion", () => {
    it("strips a leading v and trims", () => {
        expect(normalizeVersion("v0.3.1")).toBe("0.3.1");
        expect(normalizeVersion("  v0.3.1  ")).toBe("0.3.1");
        expect(normalizeVersion("0.3.1")).toBe("0.3.1");
    });
});

describe("isUpdateAvailable", () => {
    it("is false when the running build matches the latest release", () => {
        expect(isUpdateAvailable("0.3.1", "0.3.1")).toBe(false);
    });

    it("is false for a git-describe build on the same base as the latest release", () => {
        expect(isUpdateAvailable("v0.3.1-3-gabc1234", "0.3.1")).toBe(false);
    });

    it("is true for a git-describe build when the latest release has a newer base", () => {
        expect(isUpdateAvailable("v0.3.1-3-gabc1234", "0.3.2")).toBe(true);
    });

    it("is false for a dev build, whatever the latest release", () => {
        expect(isUpdateAvailable("0.3.0-dev", "9.9.9")).toBe(false);
    });

    it("is false when the running version or the latest release is unknown or unparsable", () => {
        expect(isUpdateAvailable(null, "0.4.0")).toBe(false);
        expect(isUpdateAvailable("0.3.1", null)).toBe(false);
        expect(isUpdateAvailable("0.3.1", "garbage")).toBe(false);
        expect(isUpdateAvailable("garbage", "0.4.0")).toBe(false);
    });

    it("is false when the latest value is not a plain release", () => {
        expect(isUpdateAvailable("0.3.1", "0.4.0-dev")).toBe(false);
        expect(isUpdateAvailable("0.3.1", "0.4.0-3-gabc1234")).toBe(false);
    });

    it("compares pre-1.0 majors correctly", () => {
        expect(isUpdateAvailable("0.9.4", "1.0.0")).toBe(true);
        expect(isUpdateAvailable("1.0.0", "0.9.9")).toBe(false);
    });

    it("handles a v prefix on the latest release tag", () => {
        expect(isUpdateAvailable("0.3.1", "v0.4.0")).toBe(true);
        expect(isUpdateAvailable("0.4.0", "v0.4.0")).toBe(false);
    });
});
