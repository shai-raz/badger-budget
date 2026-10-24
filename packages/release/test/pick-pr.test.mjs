import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPr } from "../src/pick-pr.mjs";

test("prefers the pull whose merge commit is the sha", () => {
    const pulls = [
        { number: 1, title: "merged earlier", merge_commit_sha: "other", merged_at: "2026-10-01T00:00:00Z" },
        { number: 2, title: "landed here", merge_commit_sha: "abc", merged_at: "2026-10-02T00:00:00Z" },
    ];
    assert.deepEqual(pickPr("abc", pulls), { number: 2, title: "landed here" });
});

test("falls back to any merged pull when none matches the sha", () => {
    const pulls = [
        { number: 3, title: "still open", merge_commit_sha: null, merged_at: null },
        { number: 4, title: "merged", merge_commit_sha: "zzz", merged_at: "2026-10-03T00:00:00Z" },
    ];
    assert.deepEqual(pickPr("abc", pulls), { number: 4, title: "merged" });
});

test("returns null when only open pulls are present", () => {
    const pulls = [{ number: 5, title: "open", merge_commit_sha: null, merged_at: null }];
    assert.equal(pickPr("abc", pulls), null);
    assert.equal(pickPr("abc", []), null);
});
