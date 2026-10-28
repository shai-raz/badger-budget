import type { PickedFile } from "./attachments";

export type AttachmentUploadStatus = "uploading" | "done" | "failed";

export interface AttachmentUploadState<F extends PickedFile = File> {
    id: string;
    file: F;
    /** Fraction uploaded, 0 to 1. */
    progress: number;
    status: AttachmentUploadStatus;
}

type UploadOutcome<F, T> = { ok: true; value: T } | { ok: false; file: F; error: unknown };

let nextUploadId = 0;

function clampFraction(fraction: number): number {
    if (!Number.isFinite(fraction)) return 0;
    return Math.min(1, Math.max(0, fraction));
}

/**
 * Uploads every file at once. Each progress or status change emits a fresh snapshot of all states.
 * Never rejects: failures come back in `failed`, so one bad file does not hide the others.
 */
export async function uploadAttachmentsInParallel<F extends PickedFile, T>(
    files: F[],
    upload: (file: F, onProgress: (fraction: number) => void) => Promise<T>,
    onChange: (states: AttachmentUploadState<F>[]) => void,
): Promise<{ succeeded: T[]; failed: { file: F; error: unknown }[] }> {
    const states: AttachmentUploadState<F>[] = files.map((file) => ({
        id: `attachment-upload-${++nextUploadId}`,
        file,
        progress: 0,
        status: "uploading",
    }));
    const emit = () => onChange(states.map((state) => ({ ...state })));
    emit();

    // Each runOne calls upload synchronously, so every request is in flight before any settles.
    // It resolves to an outcome instead of rejecting, so each failure keeps its file.
    const runOne = async (state: AttachmentUploadState<F>): Promise<UploadOutcome<F, T>> => {
        try {
            const value = await upload(state.file, (fraction) => {
                state.progress = clampFraction(fraction);
                emit();
            });
            state.status = "done";
            state.progress = 1;
            emit();
            return { ok: true, value };
        } catch (error) {
            state.status = "failed";
            emit();
            return { ok: false, file: state.file, error };
        }
    };

    const outcomes = await Promise.allSettled(states.map(runOne));

    const succeeded: T[] = [];
    const failed: { file: F; error: unknown }[] = [];
    for (const outcome of outcomes) {
        // runOne never rejects, so every settled result is fulfilled.
        if (outcome.status === "rejected") continue;
        if (outcome.value.ok) succeeded.push(outcome.value.value);
        else failed.push({ file: outcome.value.file, error: outcome.value.error });
    }
    return { succeeded, failed };
}
