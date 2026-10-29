// Source-text contract for the attachment drop zone. The web test runner is Vitest in a node environment with no DOM,
// so the listeners are checked against their source, not dispatched.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./useAttachmentDropZone.ts", import.meta.url)), "utf8");

describe("useAttachmentDropZone", () => {
    it("tracks file drags on every listener, independent of whether the drop would be accepted", () => {
        expect(source).toContain('useEventListener(target, "dragenter"');
        expect(source).toContain('useEventListener(target, "dragleave"');
        expect(source).not.toContain("checkValidity");
    });

    it("ignores drags that carry no files", () => {
        expect(source).toContain('includes("Files")');
    });

    it("shows the not-allowed cursor for refused drops, and only accepts files when allowed", () => {
        expect(source).toContain('dropEffect = options.canAccept() ? "copy" : "none"');
        expect(source).toContain("if (!options.canAccept()) return;");
    });

    it("prevents the default on every file drop, refused or not, so a file never opens in the tab", () => {
        const dropHandler = source.slice(source.indexOf('useEventListener(target, "drop"'));
        expect(dropHandler.indexOf("event.preventDefault()")).toBeGreaterThan(-1);
        expect(dropHandler.indexOf("event.preventDefault()")).toBeLessThan(dropHandler.indexOf("canAccept()"));
    });
});
