import type { AutoSyncIntervalUnit } from "@badger/shared-data";

// UI-only presets for the auto-sync interval picker. The API only knows (unit, count); a custom interval has no preset.

export type AutoSyncPresetId = "1h" | "2h" | "4h" | "12h" | "1d" | "3d" | "7d";

export interface AutoSyncPreset {
    id: AutoSyncPresetId;
    intervalUnit: AutoSyncIntervalUnit;
    intervalCount: number;
    label: string;
}

export const AUTO_SYNC_PRESETS: readonly AutoSyncPreset[] = [
    { id: "1h", intervalUnit: "hours", intervalCount: 1, label: "Every hour" },
    { id: "2h", intervalUnit: "hours", intervalCount: 2, label: "Every 2 hours" },
    { id: "4h", intervalUnit: "hours", intervalCount: 4, label: "Every 4 hours" },
    { id: "12h", intervalUnit: "hours", intervalCount: 12, label: "Every 12 hours" },
    { id: "1d", intervalUnit: "days", intervalCount: 1, label: "Every day" },
    { id: "3d", intervalUnit: "days", intervalCount: 3, label: "Every 3 days" },
    { id: "7d", intervalUnit: "days", intervalCount: 7, label: "Every week" },
];

export function matchAutoSyncPreset(unit: AutoSyncIntervalUnit, count: number): AutoSyncPresetId | "custom" {
    return AUTO_SYNC_PRESETS.find((p) => p.intervalUnit === unit && p.intervalCount === count)?.id ?? "custom";
}

export function formatAutoSyncInterval(unit: AutoSyncIntervalUnit, count: number): string {
    if (unit === "hours") return count === 1 ? "Every hour" : `Every ${count} hours`;
    if (count === 1) return "Every day";
    if (count === 7) return "Every week";
    return `Every ${count} days`;
}

/** Local time of day from minutes since midnight: 420 → "07:00". */
export function formatMinuteOfDay(minute: number): string {
    const hours = Math.floor(minute / 60);
    const minutes = minute % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
