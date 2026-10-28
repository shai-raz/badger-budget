/**
 * Writes a route query as one history step. A discrete change pushes its own entry, so Back undoes it. A run of
 * consecutive edits to one control (typing in search, ticking categories) pushes once and then replaces that entry, so
 * the whole run is one step. Back and Forward end a run, because the entry they land on is not the one it created.
 *
 * Navigation is asynchronous, so the route query lags behind the writes that were just made. Each router keeps the
 * query its latest write asked for until that navigation settles (`latestQuery`). Readers build their next write from
 * it, so back-to-back writes compose instead of overwriting each other.
 */
import { shallowRef, type ShallowRef } from "vue";
import type { LocationQueryRaw, RouteLocationAsRelativeGeneric } from "vue-router";

export type EditControl = "search" | "categories";

export type QueryWrite = { kind: "push" } | { kind: "replace" } | { kind: "edit"; control: EditControl };

/** The two navigations a query write uses. Vue Router's `Router` satisfies it. */
export interface QueryNavigator {
    push(to: RouteLocationAsRelativeGeneric): Promise<unknown>;
    replace(to: RouteLocationAsRelativeGeneric): Promise<unknown>;
}

/** The history-state key that marks the entry an edit run created. */
const RUN_KEY = "filterRun";

let activeRun: { control: EditControl; id: string } | null = null;
let runCounter = 0;

interface WriteLane {
    /** The query the latest write asked for, while its navigation is still running. */
    target: ShallowRef<LocationQueryRaw | null>;
    /** Counts writes, so only the latest write's settlement clears `target`. */
    latest: number;
}

const lanes = new WeakMap<QueryNavigator, WriteLane>();

function laneOf(router: QueryNavigator): WriteLane {
    let lane = lanes.get(router);
    if (!lane) {
        lane = { target: shallowRef(null), latest: 0 };
        lanes.set(router, lane);
    }
    return lane;
}

/**
 * The query to read and to build the next write from: the one the latest write asked for while its navigation runs,
 * otherwise `routeQuery`. Reading it inside a computed keeps that computed up to date with pending writes.
 */
export function latestQuery(router: QueryNavigator, routeQuery: LocationQueryRaw): LocationQueryRaw {
    return laneOf(router).target.value ?? routeQuery;
}

/** Holds `query` as the router's latest target until `navigation` settles. A newer write takes the target over. */
function trackWrite(router: QueryNavigator, query: LocationQueryRaw, navigation: Promise<unknown>): void {
    const lane = laneOf(router);
    lane.latest += 1;
    const write = lane.latest;
    lane.target.value = query;
    void Promise.resolve(navigation).finally(() => {
        if (lane.latest === write) lane.target.value = null;
    });
}

/** Ends the current edit run, so the next edit pushes a new entry. */
export function endEditRun(): void {
    activeRun = null;
}

if (typeof window !== "undefined") {
    window.addEventListener("popstate", endEditRun);
}

function currentEntryRunId(): unknown {
    return typeof window === "undefined" ? undefined : window.history.state?.[RUN_KEY];
}

export function writeQuery(router: QueryNavigator, query: LocationQueryRaw, write: QueryWrite): void {
    if (write.kind === "replace") {
        trackWrite(router, query, router.replace({ query }));
        return;
    }
    if (write.kind === "push") {
        endEditRun();
        trackWrite(router, query, router.push({ query }));
        return;
    }

    const run = activeRun;
    if (run !== null && run.control === write.control && currentEntryRunId() === run.id) {
        // Vue Router keeps existing history state on replace, so the entry stays marked as this run.
        trackWrite(router, query, router.replace({ query }));
        return;
    }

    runCounter += 1;
    const id = `${Date.now()}-${runCounter}`;
    activeRun = { control: write.control, id };
    trackWrite(router, query, router.push({ query, state: { [RUN_KEY]: id } }));
}
