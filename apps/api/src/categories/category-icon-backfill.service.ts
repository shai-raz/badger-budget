import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { DEFAULT_CATEGORY_AVATAR_ICON, suggestAvatarIcon, type AvatarIconName } from "@badger/shared-data";
import { PrismaService } from "../prisma/prisma.service";

export interface CategoryIconBackfillResult {
    /** False when the marker was already present, so nothing ran this time. */
    claimed: boolean;
    updated: number;
}

/**
 * One-shot backfill: gives existing user categories with no icon, or the generic "tag" icon, the icon the name
 * matcher suggests for them. The `data_backfills` marker row is claimed in the same transaction as the updates, so
 * it runs once. A later deliberate "tag" choice by the user is never overwritten. A failure rolls the marker back and
 * the next boot retries. Runs in the background so it never delays or breaks startup.
 */
@Injectable()
export class CategoryIconBackfillService implements OnApplicationBootstrap {
    static readonly MARKER = "category-icons-v1";

    private readonly logger = new Logger(CategoryIconBackfillService.name);

    constructor(private readonly prisma: PrismaService) {}

    onApplicationBootstrap(): void {
        void this.run().catch((err) => this.logger.error("Category icon backfill failed", err));
    }

    async run(): Promise<CategoryIconBackfillResult> {
        return this.prisma.$transaction(
            async (tx) => {
                const { count } = await tx.dataBackfill.createMany({
                    data: [{ name: CategoryIconBackfillService.MARKER }],
                    skipDuplicates: true,
                });
                if (count === 0) return { claimed: false, updated: 0 };

                const rows = await tx.category.findMany({
                    where: {
                        userId: { not: null },
                        isSystem: false,
                        deletedAt: null,
                        OR: [{ icon: null }, { icon: DEFAULT_CATEGORY_AVATAR_ICON }],
                    },
                    select: { id: true, name: true },
                });

                const idsByIcon = new Map<AvatarIconName, string[]>();
                for (const row of rows) {
                    const icon = suggestAvatarIcon(row.name);
                    if (!icon) continue;
                    const ids = idsByIcon.get(icon) ?? [];
                    ids.push(row.id);
                    idsByIcon.set(icon, ids);
                }

                let updated = 0;
                for (const [icon, ids] of idsByIcon) {
                    const result = await tx.category.updateMany({ where: { id: { in: ids } }, data: { icon } });
                    updated += result.count;
                }

                this.logger.log(`Category icon backfill: updated ${updated} of ${rows.length} categories`);
                return { claimed: true, updated };
            },
            { timeout: 60_000 },
        );
    }
}
