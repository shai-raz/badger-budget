import { describe, expect, it } from "vitest";
import type { IChangelogItem, IChangelogRelease, IChangelogResponse } from "@badger/types";
import { releasesForMode, typeLabel, whatsNewStartAction } from "./whatsNew";

const item = (overrides: Partial<IChangelogItem> = {}): IChangelogItem => ({
    type: "feat",
    scope: null,
    breaking: false,
    subject: "Add something",
    prUrl: null,
    ...overrides,
});

const release = (version: string, unseen: boolean): IChangelogRelease => ({
    version,
    date: "2026-10-20",
    summary: null,
    items: [item()],
    unseen,
});

const response = (overrides: Partial<IChangelogResponse> = {}): IChangelogResponse => ({
    currentVersion: "0.1.1",
    lastSeenVersion: "0.1.0",
    showOnStart: true,
    releases: [release("0.1.1", true), release("0.1.0", false)],
    ...overrides,
});

describe("whatsNewStartAction", () => {
    it("does nothing when the running version is unknown", () => {
        expect(whatsNewStartAction(response({ currentVersion: null, lastSeenVersion: null }))).toBe("none");
    });

    it("stamps silently for a user who has never been stamped", () => {
        expect(
            whatsNewStartAction(
                response({ lastSeenVersion: null, showOnStart: false, releases: [release("0.1.0", false)] }),
            ),
        ).toBe("mark-silently");
    });

    it("opens when the running build is newer and has unseen notes", () => {
        expect(whatsNewStartAction(response())).toBe("open");
    });

    it("stamps silently when the newer build has no notes for the user", () => {
        expect(whatsNewStartAction(response({ releases: [release("0.1.0", false)] }))).toBe("mark-silently");
    });

    it("does nothing when the user has already seen the running version", () => {
        expect(whatsNewStartAction(response({ showOnStart: false, lastSeenVersion: "0.1.1" }))).toBe("none");
    });
});

describe("releasesForMode", () => {
    const data = response({
        releases: [release("0.3.0", false), release("0.2.0", true), release("0.1.1", true), release("0.1.0", false)],
    });

    it("lists only unseen releases in unseen mode", () => {
        expect(releasesForMode(data, "unseen").map((r) => r.version)).toEqual(["0.2.0", "0.1.1"]);
    });

    it("lists the most recent releases in recent mode", () => {
        expect(releasesForMode(data, "recent").map((r) => r.version)).toEqual(["0.3.0", "0.2.0", "0.1.1", "0.1.0"]);
    });

    it("caps recent mode at the limit", () => {
        expect(releasesForMode(data, "recent", 2).map((r) => r.version)).toEqual(["0.3.0", "0.2.0"]);
    });
});

describe("typeLabel", () => {
    it("labels each commit type", () => {
        expect(typeLabel(item({ type: "feat" }))).toBe("New");
        expect(typeLabel(item({ type: "fix" }))).toBe("Fixed");
        expect(typeLabel(item({ type: "perf" }))).toBe("Faster");
    });

    it("marks breaking changes whatever their type", () => {
        expect(typeLabel(item({ type: "fix", breaking: true }))).toBe("Breaking");
    });
});
