import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const ACTIVE_STATUSES = ["pending", "running"];
const INTERRUPTED_MESSAGE = "Interrupted by a server restart";

/**
 * Closes bank sync runs that were still pending or running when the server last stopped. Nothing in the new process
 * can resume them, so without this they would show as in progress forever. Only runs created before this boot are
 * touched, so a run started after startup is never closed by mistake. Never throws: a recovery failure is logged and
 * startup continues.
 */
@Injectable()
export class SyncRecoveryService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SyncRecoveryService.name);
    private readonly bootAt: Date;

    constructor(private readonly prisma: PrismaService) {
        this.bootAt = new Date();
    }

    async onApplicationBootstrap(): Promise<void> {
        try {
            const { runs } = await this.recover();
            if (runs > 0) this.logger.log(`Closed ${runs} bank sync run(s) interrupted by a restart`);
        } catch (err) {
            this.logger.error("Sync recovery failed", err);
        }
    }

    async recover(): Promise<{ runs: number }> {
        const jobs = await this.prisma.syncJob.findMany({
            where: { status: { in: ACTIVE_STATUSES }, createdAt: { lt: this.bootAt } },
            select: { id: true },
        });
        if (jobs.length === 0) return { runs: 0 };

        const ids = jobs.map((job) => job.id);
        const now = new Date();
        await this.prisma.$transaction(async (tx) => {
            await tx.scraperJob.updateMany({
                where: { syncJobId: { in: ids }, status: { in: ACTIVE_STATUSES } },
                data: { status: "failed", errorCode: "INTERRUPTED", error: INTERRUPTED_MESSAGE, finishedAt: now },
            });
            await tx.syncJob.updateMany({
                where: { id: { in: ids } },
                data: { status: "interrupted", error: INTERRUPTED_MESSAGE, finishedAt: now },
            });
        });
        return { runs: ids.length };
    }
}
