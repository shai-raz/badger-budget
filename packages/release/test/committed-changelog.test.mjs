import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderChangelogMarkdown } from "../src/changelog.mjs";

const root = new URL("../../../", import.meta.url);

test("the committed CHANGELOG.md is exactly what the release tooling renders from changelog.json", () => {
    const changelog = JSON.parse(readFileSync(new URL("apps/api/changelog.json", root), "utf8"));
    const committed = readFileSync(new URL("CHANGELOG.md", root), "utf8");
    assert.equal(committed, renderChangelogMarkdown(changelog, "shai-raz/badger-budget"));
});
