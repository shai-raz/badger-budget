import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a gone subscription waits for its device to register a new endpoint in its place. Longer than the longest
 * auto-sync duration, so a grant on it has always expired first.
 */
export const GONE_SUBSCRIPTION_RETENTION_DAYS = 120;

/** Deletes subscriptions that stayed gone past the retention. Runs once on boot, then daily. Never throws. */
@Injectable()
export class PushSubscriptionCleanupService implements OnApplicationBootstrap {
    private readonly logger = new Logger(PushSubscriptionCleanupService.name);

    constructor(private readonly prisma: PrismaService) {}

    /** Not awaited: boot does not wait on the database. */
    onApplicationBootstrap(): void {
        void this.tick();
    }

    @Interval(DAY_MS)
    async tick(now = new Date()): Promise<void> {
        try {
            await this.prisma.pushSubscription.deleteMany({
                where: { goneAt: { lte: new Date(now.getTime() - GONE_SUBSCRIPTION_RETENTION_DAYS * DAY_MS) } },
            });
        } catch (err) {
            this.logger.error("Gone push subscription cleanup failed", err);
        }
    }
}
