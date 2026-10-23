import {
    ChangelogSourceRelease,
    buildChangelogResponse,
    filterUserFacing,
    nextSeenVersion,
    parseChangelogSource,
} from "./changelog";

const REPO = "shai-raz/badger-budget";

function release(version: string, items: ChangelogSourceRelease["items"] = [], summary: string | null = null) {
    return { version, date: "2026-10-20", summary, items } satisfies ChangelogSourceRelease;
}

function item(type: string, subject: string, extra: Partial<ChangelogSourceRelease["items"][number]> = {}) {
    return { type, scope: null, breaking: false, subject, pr: null, ...extra };
}

describe("filterUserFacing", () => {
    it("keeps feat, fix and perf items and drops docs, chore and refactor", () => {
        const [kept] = filterUserFacing([
            release("0.2.0", [
                item("feat", "Add thing"),
                item("fix", "Fix thing"),
                item("perf", "Speed up thing"),
                item("docs", "Document thing"),
                item("chore", "Bump deps"),
                item("refactor", "Tidy thing"),
            ]),
        ]);

        expect(kept.items.map((i) => i.type)).toEqual(["feat", "fix", "perf"]);
    });

    it("keeps a breaking refactor", () => {
        const [kept] = filterUserFacing([release("0.2.0", [item("refactor", "Rename export", { breaking: true })])]);

        expect(kept.items).toHaveLength(1);
        expect(kept.items[0].breaking).toBe(true);
    });

    it("drops a release whose items are all internal and that has no summary", () => {
        expect(filterUserFacing([release("0.2.0", [item("chore", "Bump deps")])])).toEqual([]);
    });

    it("keeps a release with a summary even when it has no items", () => {
        expect(filterUserFacing([release("0.1.0", [], "Initial public release.")])).toEqual([
            expect.objectContaining({ version: "0.1.0", summary: "Initial public release.", items: [] }),
        ]);
    });
});

describe("buildChangelogResponse", () => {
    const releases = filterUserFacing([
        release("0.4.0", [item("feat", "Four", { pr: 40 })]),
        release("0.3.1", [item("fix", "Three point one")]),
        release("0.3.0", [item("feat", "Three")]),
        release("0.2.0", [item("feat", "Two")]),
        release("0.1.0", [], "Initial public release."),
    ]);

    it("marks a user last seen on 0.2.0 as shown on start with exactly the newer releases unseen", () => {
        const response = buildChangelogResponse({
            releases,
            currentVersion: "0.4.0",
            lastSeenVersion: "0.2.0",
            repo: REPO,
        });

        expect(response.showOnStart).toBe(true);
        expect(response.currentVersion).toBe("0.4.0");
        expect(response.lastSeenVersion).toBe("0.2.0");
        expect(response.releases.filter((r) => r.unseen).map((r) => r.version)).toEqual(["0.4.0", "0.3.1", "0.3.0"]);
        expect(response.releases.find((r) => r.version === "0.2.0")?.unseen).toBe(false);
    });

    it("maps the PR number to a link", () => {
        const response = buildChangelogResponse({
            releases,
            currentVersion: "0.4.0",
            lastSeenVersion: null,
            repo: REPO,
        });

        expect(response.releases[0].items[0]).toEqual({
            type: "feat",
            scope: null,
            breaking: false,
            subject: "Four",
            prUrl: `https://github.com/${REPO}/pull/40`,
        });
        expect(response.releases[1].items[0].prUrl).toBeNull();
    });

    it("never shows and never marks unseen for a user who has not been stamped", () => {
        const response = buildChangelogResponse({
            releases,
            currentVersion: "0.4.0",
            lastSeenVersion: null,
            repo: REPO,
        });

        expect(response.showOnStart).toBe(false);
        expect(response.releases.some((r) => r.unseen)).toBe(false);
    });

    it("counts a dev build by its base version", () => {
        const response = buildChangelogResponse({
            releases,
            currentVersion: "0.4.0-dev",
            lastSeenVersion: "0.2.0",
            repo: REPO,
        });

        expect(response.currentVersion).toBe("0.4.0");
        expect(response.showOnStart).toBe(true);
        expect(response.releases.map((r) => r.version)).toEqual(["0.4.0", "0.3.1", "0.3.0", "0.2.0", "0.1.0"]);
    });

    it("hides releases newer than the running build", () => {
        const response = buildChangelogResponse({
            releases,
            currentVersion: "0.3.0",
            lastSeenVersion: "0.2.0",
            repo: REPO,
        });

        expect(response.releases.map((r) => r.version)).toEqual(["0.3.0", "0.2.0", "0.1.0"]);
        expect(response.releases.filter((r) => r.unseen).map((r) => r.version)).toEqual(["0.3.0"]);
    });

    it("returns every release and no start-up prompt when the running version is unknown", () => {
        const response = buildChangelogResponse({
            releases,
            currentVersion: null,
            lastSeenVersion: "0.2.0",
            repo: REPO,
        });

        expect(response.currentVersion).toBeNull();
        expect(response.showOnStart).toBe(false);
        expect(response.releases).toHaveLength(5);
        expect(response.releases.some((r) => r.unseen)).toBe(false);
    });
});

describe("nextSeenVersion", () => {
    it("stamps the running version when the user has never been stamped", () => {
        expect(nextSeenVersion("0.4.0", null)).toBe("0.4.0");
    });

    it("raises the stamp when the running version is newer", () => {
        expect(nextSeenVersion("0.4.0", "0.2.0")).toBe("0.4.0");
    });

    it("never downgrades after a rollback", () => {
        expect(nextSeenVersion("0.3.0", "0.4.0")).toBe("0.4.0");
        expect(nextSeenVersion("0.4.0", "0.4.0")).toBe("0.4.0");
    });

    it("stores the base version for a dev build", () => {
        expect(nextSeenVersion("0.4.0-dev", null)).toBe("0.4.0");
    });

    it("leaves the stamp alone when the running version is unknown", () => {
        expect(nextSeenVersion(null, "0.2.0")).toBe("0.2.0");
        expect(nextSeenVersion(null, null)).toBeNull();
    });
});

describe("parseChangelogSource", () => {
    it("parses the bundled file shape and defaults optional fields", () => {
        expect(
            parseChangelogSource({
                releases: [
                    {
                        version: "0.2.0",
                        date: "2026-10-21",
                        items: [{ type: "feat", subject: "Add thing", pr: 12 }],
                    },
                ],
            }),
        ).toEqual({
            releases: [
                {
                    version: "0.2.0",
                    date: "2026-10-21",
                    summary: null,
                    items: [{ type: "feat", scope: null, breaking: false, subject: "Add thing", pr: 12 }],
                },
            ],
        });
    });

    it("rejects the whole file when one entry is malformed", () => {
        expect(
            parseChangelogSource({ releases: [{ version: "0.2.0", date: "2026-10-21", items: [{ type: 1 }] }] }),
        ).toBeNull();
        expect(parseChangelogSource({ releases: "nope" })).toBeNull();
        expect(parseChangelogSource(null)).toBeNull();
    });
});
