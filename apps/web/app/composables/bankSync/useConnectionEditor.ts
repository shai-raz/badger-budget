import type { IScraperConnectionResponse } from "@badger/types";

/**
 * Opens the bank connection add/edit modal. Shared state so any page can open it while the modal stays mounted once
 * in layouts/app.vue. `focusLogin` starts an edit on the first login field instead of the dialog.
 */
export const useConnectionEditor = () => {
    const state = useState<{
        visible: boolean;
        connection: IScraperConnectionResponse | null;
        focusLogin: boolean;
    }>("connection-editor", () => ({
        visible: false,
        connection: null,
        focusLogin: false,
    }));

    return {
        state,
        openCreate: () => {
            state.value = { visible: true, connection: null, focusLogin: false };
        },
        openEdit: (connection: IScraperConnectionResponse, opts?: { focusLogin?: boolean }) => {
            state.value = { visible: true, connection, focusLogin: opts?.focusLogin ?? false };
        },
        close: () => {
            state.value = { visible: false, connection: null, focusLogin: false };
        },
    };
};
