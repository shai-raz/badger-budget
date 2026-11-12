import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { INVALID_PIN_MESSAGE, isIbsErrorCode, type SyncErrorCode } from "@badger/shared-data";
import { PrismaService } from "../prisma/prisma.service";

const ACTIVE_STATUSES = ["pending", "running"];
// Matches the message scraper.service.ts throws (note the em dash, U+2014).
const SCRAPER_FAILED_MESSAGE = /^Scraper failed: ([A-Z_]+) — /;

/** Maps a pre-error-code failure message to its SyncErrorCode. Anything unrecognised is UNKNOWN. */
export function errorCodeFromLegacyMessage(error: string | null): SyncErrorCode {
    if (error === INVALID_PIN_MESSAGE) return "CREDENTIALS_UNREADABLE";
    const match = error === null ? null : SCRAPER_FAILED_MESSAGE.exec(error);
    if (match && isIbsErrorCode(match[1])) return match[1];
    return "UNKNOWN";
}

export interface SyncErrorCodeBackfillResult {
    /** False when the marker was already present, so nothing ran this time. */
    claimed: boolean;
    /** Failed scraper jobs that got an errorCode from their legacy message. */
    classified: number;
    /** Unfinished scraper jobs closed because their sync run had already finished. */
    closed: number;
}

/**
 * One-shot backfill for rows written before `scraper_jobs.error_code` existed. Classifies failed scraper jobs from
 * their message, and closes scraper jobs left pending or running after their sync run finished. The `data_backfills`
 * marker is claimed in the same transaction, so it runs once. A failure rolls back and the next boot retries.
 * Runs in the background so it never delays or breaks startup.
 */
@Injectable()
export class SyncErrorCodeBackfillService implements OnApplicationBootstrap {
    static readonly MARKER = "sync-error-codes-v1";

    private readonly logger = new Logger(SyncErrorCodeBackfillService.name);

    constructor(private readonly prisma: PrismaService) {}

    onApplicationBootstrap(): void {
        void this.run().catch((err) => this.logger.error("Sync error code backfill failed", err));
    }

    async run(): Promise<SyncErrorCodeBackfillResult> {
        return this.prisma.$transaction(
            async (tx) => {
                const { count } = await tx.dataBackfill.createMany({
                    data: [{ name: SyncErrorCodeBackfillService.MARKER }],
                    skipDuplicates: true,
                });
                if (count === 0) return { claimed: false, classified: 0, closed: 0 };

                const failed = await tx.scraperJob.findMany({
                    where: { status: "failed", errorCode: null },
                    select: { id: true, error: true },
                });
                const idsByCode = new Map<SyncErrorCode, string[]>();
                for (const row of failed) {
                    const code = errorCodeFromLegacyMessage(row.error);
                    const ids = idsByCode.get(code) ?? [];
                    ids.push(row.id);
                    idsByCode.set(code, ids);
                }

                let classified = 0;
                for (const [code, ids] of idsByCode) {
                    const result = await tx.scraperJob.updateMany({
                        where: { id: { in: ids } },
                        data: { errorCode: code },
                    });
                    classified += result.count;
                }

                const now = new Date();
                const staleWhere = {
                    status: { in: ACTIVE_STATUSES },
                    syncJob: { status: { notIn: ACTIVE_STATUSES } },
                };
                const neverStarted = await tx.scraperJob.updateMany({
                    where: { ...staleWhere, startedAt: null },
                    data: { status: "failed", errorCode: "SYNC_START_FAILED", finishedAt: now },
                });
                const started = await tx.scraperJob.updateMany({
                    where: { ...staleWhere, startedAt: { not: null } },
                    data: { status: "failed", errorCode: "UNKNOWN", finishedAt: now },
                });
                const closed = neverStarted.count + started.count;

                this.logger.log(
                    `Sync error code backfill: classified ${classified} failed scraper job(s), closed ${closed} stale`,
                );
                return { claimed: true, classified, closed };
            },
            { timeout: 60_000 },
        );
    }
}
