import { describe, expect, it } from "vitest";
import { uploadAttachmentsInParallel, type AttachmentUploadState } from "./attachmentUploads";
import type { PickedFile } from "./attachments";

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const file = (name: string): PickedFile => ({ name, type: "application/pdf", size: 1 });

/** Flushes pending microtasks so allSettled bookkeeping runs. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("uploadAttachmentsInParallel", () => {
    it("starts every upload before any of them resolves", async () => {
        const names = ["a.pdf", "b.pdf", "c.pdf"];
        const gates = new Map(names.map((name) => [name, deferred<string>()]));
        const started: string[] = [];

        const run = uploadAttachmentsInParallel(
            names.map(file),
            (f) => {
                started.push(f.name);
                const gate = gates.get(f.name);
                return gate ? gate.promise : Promise.reject(new Error(`no gate for ${f.name}`));
            },
            () => {},
        );

        expect(started).toEqual(names);

        gates.forEach((gate, name) => gate.resolve(`ok-${name}`));
        await run;
    });

    it("emits progress as fractions, clamped to 0..1, and finishes with done states", async () => {
        const gate = deferred<string>();
        const snapshots: AttachmentUploadState<PickedFile>[][] = [];

        const run = uploadAttachmentsInParallel(
            [file("a.pdf")],
            async (_f, onProgress) => {
                onProgress(0.5);
                onProgress(1.7);
                onProgress(-2);
                return gate.promise;
            },
            (states) => snapshots.push(states),
        );

        gate.resolve("done");
        await run;

        const progressSeen = snapshots.flatMap((states) => states.map((state) => state.progress));
        expect(progressSeen).toContain(0.5);
        expect(progressSeen).toContain(1);
        expect(progressSeen).toContain(0);
        expect(Math.max(...progressSeen)).toBe(1);
        expect(Math.min(...progressSeen)).toBe(0);
        expect(snapshots.at(-1)?.map((state) => state.status)).toEqual(["done"]);
    });

    it("emits a fresh array each time so callers can replace their state", async () => {
        const snapshots: AttachmentUploadState<PickedFile>[][] = [];
        await uploadAttachmentsInParallel(
            [file("a.pdf")],
            async (_f, onProgress) => {
                onProgress(0.25);
                return "ok";
            },
            (states) => snapshots.push(states),
        );

        const [first, second] = snapshots;
        expect(snapshots.length).toBeGreaterThan(1);
        expect(first).toBeDefined();
        expect(first).not.toBe(second);
        expect(first?.[0]).not.toBe(second?.[0]);
    });

    it("puts one failure in failed while the others succeed", async () => {
        const bad = file("b.pdf");
        const files = [file("a.pdf"), bad, file("c.pdf")];
        const error = new Error("boom");
        const snapshots: AttachmentUploadState<PickedFile>[][] = [];

        const { succeeded, failed } = await uploadAttachmentsInParallel(
            files,
            async (f) => {
                if (f.name === "b.pdf") throw error;
                return `uploaded-${f.name}`;
            },
            (states) => snapshots.push(states),
        );

        expect(succeeded).toEqual(["uploaded-a.pdf", "uploaded-c.pdf"]);
        expect(failed).toEqual([{ file: bad, error }]);
        const last = snapshots.at(-1) ?? [];
        expect(last.map((s) => s.status)).toEqual(["done", "failed", "done"]);
    });

    it("reports a synchronous throw from upload as a failure", async () => {
        const { succeeded, failed } = await uploadAttachmentsInParallel(
            [file("a.pdf")],
            (): Promise<string> => {
                throw new Error("sync");
            },
            () => {},
        );
        expect(succeeded).toEqual([]);
        expect(failed).toHaveLength(1);
    });

    it("keeps a failed upload's state after other uploads settle later", async () => {
        const slow = deferred<string>();
        const snapshots: AttachmentUploadState<PickedFile>[][] = [];

        const run = uploadAttachmentsInParallel(
            [file("fast.pdf"), file("slow.pdf")],
            (f) => (f.name === "slow.pdf" ? slow.promise : Promise.reject(new Error("fail"))),
            (states) => snapshots.push(states),
        );

        await flush();
        expect(snapshots.at(-1)?.map((s) => s.status)).toEqual(["failed", "uploading"]);

        slow.resolve("ok");
        await run;
        expect(snapshots.at(-1)?.map((s) => s.status)).toEqual(["failed", "done"]);
    });
});
