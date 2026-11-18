import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { ISettingsSummary } from "@badger/types";

@Injectable()
export class SettingsService {
    constructor(private readonly prisma: PrismaService) {}

    async getSummary(userId: string): Promise<ISettingsSummary> {
        const [categories, rules, cardPayoffPatterns, passkeys, grants] = await Promise.all([
            // Must match the user-category filter in categories/categories.service.ts.
            this.prisma.category.count({ where: { userId, isSystem: false, deletedAt: null } }),
            // Must match the rules list query in rules/rules.service.ts (findAll).
            this.prisma.rule.count({ where: { userId, deletedAt: null } }),
            // Must match the list filter in card-payoff-patterns/card-payoff-patterns.service.ts (findAll).
            this.prisma.cardPayoffPattern.count({ where: { OR: [{ isSystem: true }, { userId }] } }),
            // Must match the passkey list in bank-sync/bank-sync.service.ts (listPasskeys).
            this.prisma.syncPasskey.count({ where: { userId } }),
            // Must match the grant filter in oauth/oauth-tokens.service.ts (listConnections).
            this.prisma.oAuthGrant.findMany({
                where: { userId, revokedAt: null },
                select: { client: { select: { clientName: true } } },
                orderBy: { createdAt: "desc" },
            }),
        ]);

        return {
            categories,
            rules,
            cardPayoffPatterns,
            passkeys,
            connectedApps: [...new Set(grants.map((grant) => grant.client.clientName))],
        };
    }
}
