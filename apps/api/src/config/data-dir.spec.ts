import { join } from "path";
import { resolveDataDir, resolveDebugArtifactsDir } from "./data-dir";

const CWD = join("/work", "api");

describe("resolveDataDir", () => {
    it("uses DATA_DIR when set", () => {
        expect(resolveDataDir({ DATA_DIR: "/var/lib/badger" }, CWD)).toBe("/var/lib/badger");
    });

    it("trims DATA_DIR", () => {
        expect(resolveDataDir({ DATA_DIR: "  /var/lib/badger  " }, CWD)).toBe("/var/lib/badger");
    });

    it.each([undefined, "", "   "])("falls back to ./data under cwd when DATA_DIR is %p", (value) => {
        expect(resolveDataDir({ DATA_DIR: value }, CWD)).toBe(join(CWD, "data"));
    });
});

describe("resolveDebugArtifactsDir", () => {
    it("uses DEBUG_ARTIFACTS_DIR when set, even if DATA_DIR is also set", () => {
        expect(resolveDebugArtifactsDir({ DEBUG_ARTIFACTS_DIR: "/tmp/dbg", DATA_DIR: "/var/lib/badger" }, CWD)).toBe(
            "/tmp/dbg",
        );
    });

    it("places debug-artifacts under DATA_DIR when only DATA_DIR is set", () => {
        expect(resolveDebugArtifactsDir({ DATA_DIR: "/var/lib/badger" }, CWD)).toBe(
            join("/var/lib/badger", "debug-artifacts"),
        );
    });

    it("places debug-artifacts under cwd when neither variable is set", () => {
        expect(resolveDebugArtifactsDir({}, CWD)).toBe(join(CWD, "debug-artifacts"));
    });

    it("treats blank DEBUG_ARTIFACTS_DIR and DATA_DIR as unset", () => {
        expect(resolveDebugArtifactsDir({ DEBUG_ARTIFACTS_DIR: "  ", DATA_DIR: " " }, CWD)).toBe(
            join(CWD, "debug-artifacts"),
        );
    });
});
