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

        expect(result.failed).toHaveLength(1);
        expect(result.failed[0]).toMatchObject({ file: bad });
        expect(result.failed[0]?.error).toBeInstanceOf(Error);
        expect(invalidateQueries).toHaveBeenCalledTimes(2);
    });

    it("tracks the batch in uploads while it runs, then clears it once it settles", async () => {
        const { uploads, uploadFiles } = useUploadTransactionAttachments();
        const midFlight: number[] = [];
        uploadTransactionAttachment.mockImplementation(async () => {
            midFlight.push(uploads.value.length);
            return { id: "att" };
        });

        await uploadFiles("tx-1", [file("a.pdf"), file("b.pdf")]);

        expect(midFlight).toEqual([2, 2]);
        expect(uploads.value).toEqual([]);
    });

    it("keeps the batch's tiles until the detail refetch lands", async () => {
        let releaseRefetch: () => void = () => {};
        invalidateQueries.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    releaseRefetch = resolve;
                }),
        );
        const { uploads, uploadFiles } = useUploadTransactionAttachments();

        const pending = uploadFiles("tx-1", [file("a.pdf"), file("b.pdf")]);
        await vi.waitFor(() =>
            expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["transactions", "detail", "tx-1"] }),
        );

        expect(uploads.value.map((upload) => upload.status)).toEqual(["done", "done"]);
        expect(invalidateQueries).toHaveBeenCalledTimes(1);

        releaseRefetch();
        await pending;

        expect(uploads.value).toEqual([]);
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["transactions"] });
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
