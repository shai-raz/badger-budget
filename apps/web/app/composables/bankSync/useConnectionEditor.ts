import type { IScraperConnectionResponse } from "@badger/types";

/**
 * Opens the bank connection add/edit modal. Shared state so any page can open it while the modal stays mounted once
 * in layouts/app.vue. `updateLogin` marks an edit opened from an "Update login" action: it focuses the first login
 * field, and syncs the connection after a credential change.
 */
export const useConnectionEditor = () => {
    const state = useState<{
        visible: boolean;
        connection: IScraperConnectionResponse | null;
        updateLogin: boolean;
    }>("connection-editor", () => ({
        visible: false,
        connection: null,
        updateLogin: false,
    }));

    return {
        state,
        openCreate: () => {
            state.value = { visible: true, connection: null, updateLogin: false };
        },
        openEdit: (connection: IScraperConnectionResponse, opts?: { updateLogin?: boolean }) => {
            state.value = { visible: true, connection, updateLogin: opts?.updateLogin ?? false };
        },
        close: () => {
            state.value = { visible: false, connection: null, updateLogin: false };
        },
    };
};
