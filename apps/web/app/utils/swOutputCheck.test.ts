import { describe, expect, it } from "vitest";
import { findSwOutputProblems } from "../../scripts/check-sw-output.mjs";

// One fragment per marker in scripts/check-sw-output.mjs. Removing a fragment must produce a problem that names it.
const INDEX_FRAGMENT = { keyword: "index.html", text: '{url:"/",revision:"def"}' };
const FRAGMENTS: { keyword: string; text: string }[] = [
    { keyword: "importScripts", text: 'importScripts("sw-push.js");' },
    { keyword: "sw-push.js", text: '{url:"sw-push.js",revision:"abc"}' },
    { keyword: "skipWaiting", text: "self.skipWaiting();" },
    { keyword: "clientsClaim", text: "n.clientsClaim();" },
    { keyword: "NavigationRoute", text: "n.registerRoute(new n.NavigationRoute(" },
    { keyword: "createHandlerBoundToURL", text: 'n.createHandlerBoundToURL("/"),' },
    { keyword: "^\\/api\\/", text: "{denylist:[/^\\/api\\//," },
    { keyword: "^\\/oauth\\/", text: "/^\\/oauth\\//," },
    { keyword: "^\\/\\.well-known\\/", text: "/^\\/\\.well-known\\//]}))" },
    INDEX_FRAGMENT,
];

const ALL_MARKERS = FRAGMENTS.map((fragment) => fragment.text).join("\n");
const PUBLIC_FILES = ["index.html", "sw.js", "sw-push.js"];

function without(fragment: string): string {
    return ALL_MARKERS.replace(fragment, "");
}

describe("findSwOutputProblems", () => {
    it("passes a worker that has every marker", () => {
        expect(findSwOutputProblems(ALL_MARKERS, PUBLIC_FILES)).toEqual([]);
    });

    it.each(FRAGMENTS)("reports a named problem when $keyword is removed", ({ keyword, text }) => {
        const problems = findSwOutputProblems(without(text), PUBLIC_FILES);

        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain(keyword);
    });

    it("reports a problem when sw-push.js is missing from the public output", () => {
        const problems = findSwOutputProblems(ALL_MARKERS, ["index.html", "sw.js"]);

        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain("sw-push.js");
    });

    it("skips the index.html precache check when the build has no index.html", () => {
        expect(findSwOutputProblems(without(INDEX_FRAGMENT.text), ["sw.js", "sw-push.js"])).toEqual([]);
    });
});
