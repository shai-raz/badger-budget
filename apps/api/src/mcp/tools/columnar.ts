export interface ColumnarResult {
    columns: string[];
    rows: unknown[][];
    rowCount: number;
    truncated: boolean;
    [k: string]: unknown;
}

export function toColumnar(
    columns: readonly string[],
    records: Record<string, unknown>[],
    extra?: Record<string, unknown>,
): ColumnarResult {
    const rows = records.map((r) => columns.map((c) => r[c] ?? null));
    return { columns: [...columns], rows, rowCount: rows.length, truncated: false, ...extra };
}

export function toIsoDate(d: Date | null): string | null {
    return d ? d.toISOString().slice(0, 10) : null;
}

export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function maskAccountNumber(v: string | null): string | null {
    if (!v) return null;
    return v.length <= 4 ? "****" : `****${v.slice(-4)}`;
}
