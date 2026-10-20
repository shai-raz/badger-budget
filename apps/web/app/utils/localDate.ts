const pad = (n: number) => String(n).padStart(2, "0");

/** Build YYYY-MM-DD from LOCAL getters — never toISOString() on a local date (see #9). */
export function toLocalIsoDate(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
