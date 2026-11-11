import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Deletes auto-sync grants and their credentials once they expire, so a lapsed grant keeps no encrypted credentials
 * around. Runs once on boot, then hourly. Never throws: a failed tick is logged and the next one retries.
 */
@Injectable()
export class AutoSyncCleanupService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(AutoSyncCleanupService.name);
    private timer?: NodeJS.Timeout;

    constructor(private readonly prisma: PrismaService) {}

    async onApplicationBootstrap(): Promise<void> {
        this.timer = setInterval(() => {
            void this.tick();
        }, HOUR_MS);
        this.timer.unref();
        await this.tick();
    }

    onModuleDestroy(): void {
        clearInterval(this.timer);
    }

    async tick(now = new Date()): Promise<void> {
        try {
            await this.prisma.autoSyncCredential.deleteMany({ where: { grant: { expiresAt: { lte: now } } } });
            await this.prisma.autoSyncGrant.deleteMany({ where: { expiresAt: { lte: now } } });
        } catch (err) {
            this.logger.error("Auto-sync expiry cleanup failed", err);
        }
    }
}
