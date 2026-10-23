import type { WhatsNewMode } from "~/utils/whatsNew";

/** Opens the What's New dialog. Shared state so the nav item and the layout's auto-open use one dialog. */
export const useWhatsNewDialog = () => {
    const state = useState<{ visible: boolean; mode: WhatsNewMode }>("whats-new-dialog", () => ({
        visible: false,
        mode: "recent",
    }));

    return {
        state,
        openRecent: () => {
            state.value = { visible: true, mode: "recent" };
        },
        openUnseen: () => {
            state.value = { visible: true, mode: "unseen" };
        },
        close: () => {
            state.value = { ...state.value, visible: false };
        },
    };
};
