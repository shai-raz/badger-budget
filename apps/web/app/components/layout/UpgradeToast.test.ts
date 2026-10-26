// Source-text contract test: UpgradeToast's toasts can't be mounted in the node environment (no DOM, no test-utils), so
// this guards the ordering that made the done and ready toasts vanish after Reload. The phase watcher must start in
// onMounted, after the child <Toast> has subscribed to the toast bus. An immediate watcher runs during setup, where
// toast.add goes nowhere, and claimDoneToast has already cleared the shared entry.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./UpgradeToast.vue", import.meta.url)), "utf8");
const script = source.slice(source.indexOf("<script"), source.indexOf("</script>"));
const template = source.slice(source.indexOf("</script>"));

describe("UpgradeToast announcement timing", () => {
    it("does not announce from an immediate watcher during setup", () => {
        expect(script).not.toMatch(/immediate:\s*true/);
    });

    it("announces the current phase once the component is mounted", () => {
        expect(script).toMatch(/watch\(phase, announce\);/);
        expect(script).toMatch(/onMounted\(\(\) => announce\(phase\.value, null\)\);/);
    });

    it("mounts the Toast it announces into", () => {
        expect(template).toContain(':group="UPGRADE_TOAST_GROUP"');
    });
});
