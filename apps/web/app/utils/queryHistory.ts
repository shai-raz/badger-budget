/**
 * Writes a route query as one history step. A discrete change pushes its own entry, so Back undoes it. A run of
 * consecutive edits to one control (typing in search, ticking categories) pushes once and then replaces that entry, so
 * the whole run is one step. Back and Forward end a run, because the entry they land on is not the one it created.
 */
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
        void router.replace({ query });
        return;
    }
    if (write.kind === "push") {
        endEditRun();
        void router.push({ query });
        return;
    }

    const run = activeRun;
    if (run !== null && run.control === write.control && currentEntryRunId() === run.id) {
        // Vue Router keeps existing history state on replace, so the entry stays marked as this run.
        void router.replace({ query });
        return;
    }

    runCounter += 1;
    const id = `${Date.now()}-${runCounter}`;
    activeRun = { control: write.control, id };
    void router.push({ query, state: { [RUN_KEY]: id } });
}
