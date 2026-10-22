import { test } from "node:test";
import assert from "node:assert/strict";
import { setPackageVersion } from "../src/package-version.mjs";

const PACKAGE_JSON = `{
    "name": "@badger/web",
    "version": "0.0.0",
    "private": true,
    "dependencies": {
        "version": "1.0.0"
    }
}
`;

test("setPackageVersion replaces only the top-level version", () => {
    const next = setPackageVersion(PACKAGE_JSON, "0.1.0");
    assert.equal(next, PACKAGE_JSON.replace('"version": "0.0.0"', '"version": "0.1.0"'));
});

test("setPackageVersion ignores a nested version that appears first", () => {
    const text = `{
    "nested": {
        "version": "9.9.9"
    },
    "version": "0.0.0"
}
`;
    assert.equal(setPackageVersion(text, "0.1.0"), text.replace('"version": "0.0.0"', '"version": "0.1.0"'));
});

test("setPackageVersion keeps the file's other bytes, including CRLF and missing final newline", () => {
    const text = '{\r\n    "version": "0.0.0"\r\n}';
    assert.equal(setPackageVersion(text, "0.2.0"), '{\r\n    "version": "0.2.0"\r\n}');
});

test("setPackageVersion throws when there is no version field", () => {
    assert.throws(() => setPackageVersion('{\n    "name": "x"\n}\n', "0.1.0"), /No top-level "version" field/);
});
