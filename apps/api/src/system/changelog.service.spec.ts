import { Logger } from "@nestjs/common";
import { BUNDLED_CHANGELOG_PATH, ChangelogService, readChangelogFile } from "./changelog.service";

describe("ChangelogService", () => {
    const fixture = {
        releases: [
            {
                version: "0.2.0",
                date: "2026-10-21",
                summary: null,
                items: [
                    { type: "feat", scope: "transactions", breaking: false, subject: "Add thing", pr: 3 },
                    { type: "chore", scope: null, breaking: false, subject: "Bump deps", pr: 4 },
                ],
            },
            { version: "0.1.0", date: "2026-10-20", summary: "Initial public release.", items: [] },
        ],
    };

    it("returns only user-facing releases from the reader", () => {
        const service = new ChangelogService(() => fixture);

        expect(service.getReleases()).toEqual([
            expect.objectContaining({ version: "0.2.0", items: [expect.objectContaining({ subject: "Add thing" })] }),
            expect.objectContaining({ version: "0.1.0", summary: "Initial public release." }),
        ]);
    });

    it("reads the file once and keeps it", () => {
        const reader = jest.fn(() => fixture);
        const service = new ChangelogService(reader);

        service.getReleases();
        service.getReleases();

        expect(reader).toHaveBeenCalledTimes(1);
    });

    it("returns no releases and warns once when the file is missing or invalid", () => {
        const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
        const service = new ChangelogService(() => readChangelogFile("Z:/does/not/exist/changelog.json"));

        expect(service.getReleases()).toEqual([]);
        expect(service.getReleases()).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);

        warn.mockRestore();
    });

    it("reads the bundled changelog that ships in the image", () => {
        const raw = readChangelogFile(BUNDLED_CHANGELOG_PATH);

        expect(raw).toEqual(expect.objectContaining({ releases: expect.any(Array) }));
        expect(new ChangelogService(() => raw).getReleases().map((r) => r.version)).toContain("0.1.0");
    });
});
