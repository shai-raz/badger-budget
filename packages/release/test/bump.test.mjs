import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBump, decideBump, parseTag } from "../src/bump.mjs";

test("decideBump takes the highest bump across entries", () => {
    assert.equal(
        decideBump([
            { type: "fix", breaking: false },
            { type: "feat", breaking: false },
            { type: "fix", breaking: false },
        ]),
        "minor",
    );
    assert.equal(decideBump([{ type: "perf", breaking: false }]), "patch");
    assert.equal(
        decideBump([
            { type: "docs", breaking: false },
            { type: "feat", breaking: true },
        ]),
        "major",
    );
});

test("decideBump returns null when nothing user-facing changed", () => {
    assert.equal(
        decideBump([
            { type: "docs", breaking: false },
            { type: "chore", breaking: false },
        ]),
        null,
    );
    assert.equal(decideBump([]), null);
});

test("applyBump on 0.x turns a breaking change into a minor bump", () => {
    assert.equal(applyBump("0.4.2", "major"), "0.5.0");
});

test("applyBump on 1.x and later follows semver", () => {
    assert.equal(applyBump("1.2.3", "major"), "2.0.0");
    assert.equal(applyBump("1.2.3", "minor"), "1.3.0");
    assert.equal(applyBump("1.2.3", "patch"), "1.2.4");
});

test("applyBump handles patch and minor on 0.x", () => {
    assert.equal(applyBump("0.3.0", "patch"), "0.3.1");
    assert.equal(applyBump("0.3.1", "minor"), "0.4.0");
});

test("applyBump with no bump leaves the version alone", () => {
    assert.equal(applyBump("0.3.1", null), "0.3.1");
});

test("applyBump rejects an unparsable version", () => {
    assert.throws(() => applyBump("1.2", "patch"), /unparsable version/);
    assert.throws(() => applyBump("v1.2.3", "patch"), /unparsable version/);
});

test("parseTag accepts vX.Y.Z only", () => {
    assert.equal(parseTag("v0.2.0"), "0.2.0");
    assert.equal(parseTag("0.2.0"), null);
    assert.equal(parseTag("v0.2"), null);
    assert.equal(parseTag("release-0.2.0"), null);
});
