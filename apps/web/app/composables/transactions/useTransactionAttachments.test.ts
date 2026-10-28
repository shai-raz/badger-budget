import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUploadTransactionAttachments } from "./useTransactionAttachments";

const invalidateQueries = vi.fn().mockResolvedValue(undefined);
const uploadTransactionAttachment = vi.fn();

vi.mock("@tanstack/vue-query", () => ({
    useMutation: () => ({}),
    useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock("../useApiClient", () => ({ useApiClient: () => ({ uploadTransactionAttachment }) }));
vi.mock("./useTransactions", () => ({
    transactionKeys: {
        all: ["transactions"],
        detail: (id: string) => ["transactions", "detail", id],
    },
}));

beforeEach(() => {
    vi.clearAllMocks();
    uploadTransactionAttachment.mockImplementation(async () => ({ id: "att" }));
});

const file = (name: string) => new File(["x"], name, { type: "application/pdf" });

describe("useUploadTransactionAttachments", () => {
    it("invalidates the transaction detail and root keys once for a 3-file batch", async () => {
        const { uploadFiles } = useUploadTransactionAttachments();

        const result = await uploadFiles("tx-1", [file("a.pdf"), file("b.pdf"), file("c.pdf")]);

        expect(uploadTransactionAttachment).toHaveBeenCalledTimes(3);
        expect(result).toEqual({ failed: [] });
        expect(invalidateQueries).toHaveBeenCalledTimes(2);
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["transactions", "detail", "tx-1"] });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["transactions"] });
    });

    it("returns the failed files and still invalidates once", async () => {
        const bad = file("bad.pdf");
        uploadTransactionAttachment.mockImplementation(async (_id: string, f: File) => {
            if (f === bad) throw new Error("nope");
            return { id: "att" };
        });
        const { uploadFiles } = useUploadTransactionAttachments();

        const result = await uploadFiles("tx-1", [file("ok.pdf"), bad]);

        expect(result).toEqual({ failed: [bad] });
        expect(invalidateQueries).toHaveBeenCalledTimes(2);
    });

    it("tracks the batch in uploads while it runs, then clears it once it settles", async () => {
        const { uploads, isUploading, uploadFiles } = useUploadTransactionAttachments();
        const midFlight: { count: number; uploading: boolean }[] = [];
        uploadTransactionAttachment.mockImplementation(async () => {
            midFlight.push({
                count: uploads.value.length,
                uploading: isUploading.value,
            });
            return { id: "att" };
        });

        await uploadFiles("tx-1", [file("a.pdf"), file("b.pdf")]);

        expect(midFlight).toEqual([
            { count: 2, uploading: true },
            { count: 2, uploading: true },
        ]);
        expect(uploads.value).toEqual([]);
        expect(isUploading.value).toBe(false);
    });

    it("passes progress through to the API client", async () => {
        uploadTransactionAttachment.mockImplementation(
            async (_id: string, _f: File, _name: string, opts: { onProgress: (n: number) => void }) => {
                opts.onProgress(0.4);
                return { id: "att" };
            },
        );
        const { uploadFiles } = useUploadTransactionAttachments();

        await uploadFiles("tx-1", [file("a.pdf")]);

        expect(uploadTransactionAttachment).toHaveBeenCalledWith("tx-1", expect.any(File), "a.pdf", {
            onProgress: expect.any(Function),
        });
    });
});
