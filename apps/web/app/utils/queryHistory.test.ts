import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteLocationAsRelativeGeneric } from "vue-router";
import { endEditRun, latestQuery, writeQuery } from "./queryHistory";

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

    it("ends a run when endEditRun is called, as the Back and Forward handler does", () => {
        writeQuery(env.router, { q: "r" }, { kind: "edit", control: "search" });
        // The popstate listener calls endEditRun. It is called directly here: the listener is only registered when the
        // module loads in a browser window, which this suite does not have at import time.
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

describe("latestQuery", () => {
    /** Lets the follow-up callbacks of settled navigations run. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    it("reads the route query when no write is pending", () => {
        expect(latestQuery(env.router, { sort: "newest" })).toEqual({ sort: "newest" });
    });

    it("reads the query a write asked for until its navigation settles", async () => {
        let finish: () => void = () => undefined;
        env.router.push.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = () => resolve(undefined);
                }),
        );

        writeQuery(env.router, { sort: "oldest" }, { kind: "push" });

        expect(latestQuery(env.router, { sort: "newest" })).toEqual({ sort: "oldest" });

        finish();
        await settle();

        expect(latestQuery(env.router, { sort: "newest" })).toEqual({ sort: "newest" });
    });

    it("keeps the newest pending query when an older navigation settles first", async () => {
        const finishers: Array<() => void> = [];
        env.router.push.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finishers.push(() => resolve(undefined));
                }),
        );

        writeQuery(env.router, { sort: "oldest" }, { kind: "push" });
        writeQuery(env.router, { sort: "oldest", hidden: "1" }, { kind: "push" });

        finishers[0]?.();
        await settle();

        expect(latestQuery(env.router, {})).toEqual({ sort: "oldest", hidden: "1" });

        finishers[1]?.();
        await settle();

        expect(latestQuery(env.router, {})).toEqual({});
    });

    it("keeps the pending query per router", () => {
        const other = { push: () => new Promise(() => undefined), replace: () => new Promise(() => undefined) };
        env.router.push.mockImplementationOnce(() => new Promise(() => undefined));

        writeQuery(env.router, { sort: "oldest" }, { kind: "push" });

        expect(latestQuery(other, {})).toEqual({});
    });
});
