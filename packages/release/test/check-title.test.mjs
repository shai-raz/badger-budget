import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/check-title.mjs", import.meta.url));

function check(title) {
    return spawnSync(process.execPath, [bin], {
        env: { ...process.env, PR_TITLE: title },
        encoding: "utf8",
    });
}

test("a conventional PR title exits 0", () => {
    const result = check("feat: x");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /type "feat"/);
});

test("a breaking conventional PR title exits 0 and says so", () => {
    const result = check("fix(api)!: drop x");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /type "fix", breaking/);
});

test("a plain PR title exits 1 and lists the allowed types and the format", () => {
    const result = check("Add thing");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /type\(scope\)\?!\?: subject/);
    assert.match(result.stderr, /Allowed types: feat, fix/);
});

test("an empty PR title exits 1", () => {
    assert.equal(check("").status, 1);
});
