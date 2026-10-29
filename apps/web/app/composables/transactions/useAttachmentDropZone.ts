import { ref, type Ref } from "vue";
import { useEventListener } from "@vueuse/core";

export interface AttachmentDropZoneOptions {
    /** Read on every drag event. A refused drop shows the not-allowed cursor and is never uploaded. */
    canAccept: () => boolean;
    onDrop: (files: File[]) => void;
}

const isFileDrag = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes("Files");

/**
 * Tracks files dragged over `target` in every state, so a card that refuses the drop can still say why.
 * Unlike VueUse's useDropZone, `isDragging` never depends on whether the drop would be accepted.
 * Drags that carry no files are ignored, so text dragged within the page is untouched. For file drags the default
 * is always prevented, so a file dropped on the card never opens in the browser tab.
 */
export function useAttachmentDropZone(
    target: Ref<HTMLElement | null>,
    options: AttachmentDropZoneOptions,
): { isDragging: Ref<boolean> } {
    const isDragging = ref(false);
    // dragenter and dragleave fire for every child the pointer crosses, so count them to know when the drag truly leaves.
    let depth = 0;

    useEventListener(target, "dragenter", (event: DragEvent) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        depth += 1;
        isDragging.value = true;
    });

    useEventListener(target, "dragover", (event: DragEvent) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = options.canAccept() ? "copy" : "none";
    });

    useEventListener(target, "dragleave", (event: DragEvent) => {
        if (!isFileDrag(event)) return;
        depth = Math.max(0, depth - 1);
        if (depth === 0) isDragging.value = false;
    });

    useEventListener(target, "drop", (event: DragEvent) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        depth = 0;
        isDragging.value = false;
        if (!options.canAccept()) return;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length > 0) options.onDrop(files);
    });

    return { isDragging };
}
