/**
 * Index of the radio to focus after a key press in an ARIA radio group, or null when the key is not a
 * navigation key. Arrow keys wrap around; Home and End jump to the first and last radio.
 */
export function nextRadioIndex(current: number, key: string, count: number): number | null {
    if (count <= 0) return null;

    switch (key) {
        case "ArrowRight":
        case "ArrowDown":
            return (((current + 1) % count) + count) % count;
        case "ArrowLeft":
        case "ArrowUp":
            return (((current - 1) % count) + count) % count;
        case "Home":
            return 0;
        case "End":
            return count - 1;
        default:
            return null;
    }
}
