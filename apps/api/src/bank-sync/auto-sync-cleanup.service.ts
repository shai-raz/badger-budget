import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Deletes auto-sync grants and their credentials once they expire, so a lapsed grant keeps no encrypted credentials
 * around. Runs once on boot, then hourly. Never throws: a failed tick is logged and the next one retries.
 */
@Injectable()
export class AutoSyncCleanupService implements OnApplicationBootstrap {
    private readonly logger = new Logger(AutoSyncCleanupService.name);

    constructor(private readonly prisma: PrismaService) {}

    /** Not awaited, like UpdateCheckService: boot does not wait on the database. */
    onApplicationBootstrap(): void {
        void this.tick();
    }

    @Interval(HOUR_MS)
    async tick(now = new Date()): Promise<void> {
        try {
            await this.prisma.autoSyncCredential.deleteMany({ where: { grant: { expiresAt: { lte: now } } } });
            await this.prisma.autoSyncGrant.deleteMany({ where: { expiresAt: { lte: now } } });
        } catch (err) {
            this.logger.error("Auto-sync expiry cleanup failed", err);
        }
    }
}
