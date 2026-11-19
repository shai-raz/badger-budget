import { describe, expect, it } from "vitest";
import { useUpdateDialog } from "./useUpdateDialog";

describe("useUpdateDialog", () => {
    it("openConfirm opens the dialog on the confirm step", () => {
        const { open, confirming, openConfirm } = useUpdateDialog();
        openConfirm();
        expect(open.value).toBe(true);
        expect(confirming.value).toBe(true);
    });

    it("closeDialog closes the dialog", () => {
        const { open, closeDialog, openDialog } = useUpdateDialog();
        openDialog();
        closeDialog();
        expect(open.value).toBe(false);
    });

    it("openDialog opens the dialog and clears the confirm step", () => {
        const { open, confirming, openConfirm, openDialog } = useUpdateDialog();
        openConfirm();
        openDialog();
        expect(open.value).toBe(true);
        expect(confirming.value).toBe(false);
    });
});
