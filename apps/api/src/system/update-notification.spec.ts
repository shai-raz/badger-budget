import { buildUpdateAvailableNotification } from "./update-notification";

describe("buildUpdateAvailableNotification", () => {
    it("links to the update dialog and offers Upgrade now when the deploy webhook is configured", () => {
        expect(buildUpdateAvailableNotification("0.4.0", true)).toEqual({
            type: "system.update-available",
            title: "Badger Budget v0.4.0 is available",
            body: "Tap to see what's new, or upgrade now.",
            url: "/?update=open",
            data: { version: "0.4.0" },
            actions: [{ id: "upgrade-now", title: "Upgrade now", url: "/?update=upgrade" }],
        });
    });

    it("offers How to upgrade when the deploy webhook is not configured", () => {
        expect(buildUpdateAvailableNotification("0.4.0", false)).toEqual({
            type: "system.update-available",
            title: "Badger Budget v0.4.0 is available",
            body: "Tap to see what's new and how to upgrade.",
            url: "/?update=open",
            data: { version: "0.4.0" },
            actions: [{ id: "how-to-upgrade", title: "How to upgrade", url: "/?update=open" }],
        });
    });
});
