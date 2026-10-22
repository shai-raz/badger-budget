import { test } from "node:test";
import assert from "node:assert/strict";
import { TYPES, isReleaseCommit, parseTitle, stripPrSuffix } from "../src/conventional.mjs";

test("a plain sentence is not a conventional title", () => {
    assert.equal(parseTitle("Add thing"), null);
});

test("a conventional title parses into type, scope, breaking and subject", () => {
    assert.deepEqual(parseTitle("feat: add thing"), {
        type: "feat",
        scope: null,
        breaking: false,
        subject: "add thing",
    });
    assert.deepEqual(parseTitle("fix(api)!: drop x"), {
        type: "fix",
        scope: "api",
        breaking: true,
        subject: "drop x",
    });
});

test("the subject collapses whitespace runs and trims the edges", () => {
    assert.equal(parseTitle("fix: a  b")?.subject, "a b");
    assert.equal(parseTitle("fix:  leading")?.subject, "leading");
    assert.equal(parseTitle("feat(web): x\t\ty  ")?.subject, "x y");
});

test("every listed type is accepted", () => {
    for (const type of TYPES) {
        assert.notEqual(parseTitle(`${type}: something`), null, type);
    }
});

test("malformed titles are rejected", () => {
    assert.equal(parseTitle("feat:missing space"), null);
    assert.equal(parseTitle("Feat: x"), null);
    assert.equal(parseTitle("feat(): x"), null);
    assert.equal(parseTitle("unknown: x"), null);
});

test("a BREAKING CHANGE footer in the body marks a breaking change", () => {
    const parsed = parseTitle("feat: new login", "Details here.\n\nBREAKING CHANGE: tokens expire faster");
    assert.equal(parsed?.breaking, true);
    assert.equal(parseTitle("feat: new login", "BREAKING-CHANGE: yes")?.breaking, true);
    assert.equal(parseTitle("feat: new login", "mentions BREAKING CHANGE: in prose")?.breaking, false);
});

test("stripPrSuffix removes a squash-merge PR suffix", () => {
    assert.deepEqual(stripPrSuffix("feat: add thing (#123)"), { subject: "feat: add thing", pr: 123 });
    assert.deepEqual(stripPrSuffix("feat: add thing"), { subject: "feat: add thing", pr: null });
});

test("isReleaseCommit recognises the release workflow commit", () => {
    assert.equal(isReleaseCommit("chore(release): v0.2.0"), true);
    assert.equal(isReleaseCommit("chore: tidy"), false);
});
