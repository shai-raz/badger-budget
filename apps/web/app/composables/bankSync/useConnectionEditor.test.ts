import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { IScraperConnectionResponse } from "@badger/types";

import { useConnectionEditor } from "./useConnectionEditor";

// Nuxt's useState shares one value per key across callers; a Map gives the same behaviour in node.
const stateByKey = new Map<string, unknown>();

beforeEach(() => {
    stateByKey.clear();
    vi.stubGlobal("useState", (key: string, init: () => unknown) => {
        if (!stateByKey.has(key)) stateByKey.set(key, ref(init()));
        return stateByKey.get(key);
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const connection = { id: "c1", displayName: "Main" } as unknown as IScraperConnectionResponse;

describe("useConnectionEditor", () => {
    it("starts closed with no connection and no login focus", () => {
        const { state } = useConnectionEditor();
        expect(state.value).toEqual({ visible: false, connection: null, focusLogin: false });
    });

    it("openCreate opens an empty form", () => {
        const { state, openCreate } = useConnectionEditor();
        openCreate();
        expect(state.value).toEqual({ visible: true, connection: null, focusLogin: false });
    });

    it("openEdit opens the given connection with the dialog focused by default", () => {
        const { state, openEdit } = useConnectionEditor();
        openEdit(connection);
        expect(state.value).toEqual({ visible: true, connection, focusLogin: false });
    });

    it("openEdit with focusLogin asks for the first login field", () => {
        const { state, openEdit } = useConnectionEditor();
        openEdit(connection, { focusLogin: true });
        expect(state.value).toEqual({ visible: true, connection, focusLogin: true });
    });

    it("close hides the dialog and drops the connection and login focus", () => {
        const { state, openEdit, close } = useConnectionEditor();
        openEdit(connection, { focusLogin: true });
        close();
        expect(state.value).toEqual({ visible: false, connection: null, focusLogin: false });
    });

    it("shares one state between callers, so any page sees the same dialog", () => {
        useConnectionEditor().openCreate();
        expect(useConnectionEditor().state.value.visible).toBe(true);
    });
});
