import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteLocationAsRelativeGeneric } from "vue-router";
import { endEditRun, writeQuery } from "./queryHistory";

/**
 * A stand-in for the router and the browser history. `push` starts a new entry whose state is the one passed in;
 * `replace` keeps the current entry's state and merges the new one in, as vue-router does.
 */
function fakeHistory() {
    const window = { history: { state: null as Record<string, unknown> | null } };
    const router = {
        push: vi.fn((location: RouteLocationAsRelativeGeneric) => {
            window.history.state = { ...location.state };
            return Promise.resolve(undefined);
        }),
        replace: vi.fn((location: RouteLocationAsRelativeGeneric) => {
            window.history.state = { ...window.history.state, ...location.state };
            return Promise.resolve(undefined);
        }),
    };
    vi.stubGlobal("window", window);
    return { router, window };
}

let env: ReturnType<typeof fakeHistory>;

beforeEach(() => {
    endEditRun();
    env = fakeHistory();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("writeQuery", () => {
    it("pushes a discrete change as its own entry", () => {
        writeQuery(env.router, { sort: "oldest" }, { kind: "push" });
        writeQuery(env.router, { sort: "name" }, { kind: "push" });

        expect(env.router.push).toHaveBeenCalledTimes(2);
        expect(env.router.replace).not.toHaveBeenCalled();
    });

    it("replaces without touching the history for a replace write", () => {
        writeQuery(env.router, { from: "2026-07" }, { kind: "replace" });

        expect(env.router.replace).toHaveBeenCalledWith({ query: { from: "2026-07" } });
        expect(env.router.push).not.toHaveBeenCalled();
    });

    it("pushes once for a whole run of search edits, then replaces", () => {
        writeQuery(env.router, { q: "r" }, { kind: "edit", control: "search" });
        writeQuery(env.router, { q: "re" }, { kind: "edit", control: "search" });
        writeQuery(env.router, { q: "ren" }, { kind: "edit", control: "search" });

        expect(env.router.push).toHaveBeenCalledTimes(1);
        expect(env.router.replace).toHaveBeenCalledTimes(2);
        expect(env.router.push.mock.calls[0]?.[0]).toMatchObject({ state: { filterRun: expect.any(String) } });
    });

    it("pushes once for a whole run of category edits, then replaces", () => {
        writeQuery(env.router, { categories: "a" }, { kind: "edit", control: "categories" });
        writeQuery(env.router, { categories: "a,b" }, { kind: "edit", control: "categories" });

        expect(env.router.push).toHaveBeenCalledTimes(1);
        expect(env.router.replace).toHaveBeenCalledTimes(1);
    });

    it("starts a new entry when the edited control changes mid-run", () => {
        writeQuery(env.router, { q: "rent" }, { kind: "edit", control: "search" });
        writeQuery(env.router, { q: "rent", categories: "a" }, { kind: "edit", control: "categories" });

        expect(env.router.push).toHaveBeenCalledTimes(2);
    });

    it("ends a run with a discrete change, so the next edit pushes again", () => {
        writeQuery(env.router, { q: "r" }, { kind: "edit", control: "search" });
        writeQuery(env.router, { q: "r", sort: "oldest" }, { kind: "push" });
        writeQuery(env.router, { q: "re", sort: "oldest" }, { kind: "edit", control: "search" });

        expect(env.router.push).toHaveBeenCalledTimes(3);
    });

    it("ends a run on Back or Forward, so the next edit pushes again", () => {
        writeQuery(env.router, { q: "r" }, { kind: "edit", control: "search" });
        // A popstate lands on another entry; the browser fires it, which the module listens for.
        endEditRun();
        writeQuery(env.router, { q: "re" }, { kind: "edit", control: "search" });

        expect(env.router.push).toHaveBeenCalledTimes(2);
    });

    it("does not continue a run on an entry that the run did not create", () => {
        writeQuery(env.router, { q: "r" }, { kind: "edit", control: "search" });
        // The current entry was created by some other run, so an edit must not rewrite it.
        env.window.history.state = { filterRun: "some-other-run" };
        writeQuery(env.router, { q: "re" }, { kind: "edit", control: "search" });

        expect(env.router.push).toHaveBeenCalledTimes(2);
        expect(env.router.replace).not.toHaveBeenCalled();
    });

    it("keeps the run marker when a replace write happens inside a run", () => {
        writeQuery(env.router, { q: "r" }, { kind: "edit", control: "search" });
        const marker = env.window.history.state?.filterRun;
        writeQuery(env.router, { q: "re" }, { kind: "edit", control: "search" });

        expect(env.window.history.state?.filterRun).toBe(marker);
    });
});
