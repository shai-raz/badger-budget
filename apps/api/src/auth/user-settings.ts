import type { IUserSettings } from "@badger/types";
import { DEFAULT_UNMATCHED_IMPORT_CATEGORY, isUnmatchedImportCategoryMode } from "@badger/shared-data";
import type { PrismaService } from "../prisma/prisma.service";

/** Narrows the stored JSON to the known settings keys, filling defaults. Never throws; unknown keys are dropped. */
export function parseUserSettings(raw: unknown): IUserSettings {
    const source =
        raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    return {
        unmatchedImportCategory: isUnmatchedImportCategoryMode(source.unmatchedImportCategory)
            ? source.unmatchedImportCategory
            : DEFAULT_UNMATCHED_IMPORT_CATEGORY,
    };
}

/** Reads and resolves one user's settings. A missing row resolves to the defaults. */
export async function loadUserSettings(db: Pick<PrismaService, "user">, userId: string): Promise<IUserSettings> {
    const row = await db.user.findUnique({ where: { id: userId }, select: { settings: true } });
    return parseUserSettings(row?.settings);
}
