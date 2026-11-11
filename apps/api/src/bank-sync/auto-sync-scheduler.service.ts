import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import {
    autoSyncRunTokenTtlMs,
    isAutoSyncIntervalUnit,
    type AutoSyncSchedule,
    type NotificationContent,
} from "@badger/shared-data";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationPreferencesService } from "../notifications/notification-preferences.service";
import { PushService } from "../notifications/push.service";
import { AutoSyncService } from "./auto-sync.service";
import { jitterRunAt, nextScheduledRunAt, parseAutoSyncSchedule } from "./auto-sync-schedule";
import { bankSyncConcurrency } from "./bank-sync.service";

export const AUTO_SYNC_TICK_MS = 5 * 60_000;
export const AUTO_SYNC_EXPIRY_WARNING_MS = 3 * 24 * 3_600_000;

const AUTO_SYNC_PATH = "/bank-connections";

const DUE_GRANT_SELECT = {
    id: true,
    userId: true,
    pushSubscriptionId: true,
    intervalUnit: true,
    intervalCount: true,
    windowStartMinute: true,
    windowEndMinute: true,
    runAtMinute: true,
    timeZone: true,
    scheduledRunAt: true,
} as const;

type DueGrant = {
    id: string;
    userId: string;
    pushSubscriptionId: string;
    intervalUnit: string;
    intervalCount: number;
    windowStartMinute: number | null;
    windowEndMinute: number | null;
    runAtMinute: number | null;
    timeZone: string;
    scheduledRunAt: Date;
};

type ExpiringGrant = { id: string; userId: string; pushSubscriptionId: string; timeZone: string; expiresAt: Date };

/** The day and month a grant's expiry falls on, in the grant's own time zone. */
function formatExpiryDate(expiresAt: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone }).format(expiresAt);
}

/**
 * Sends the scheduled auto-sync run pushes, the expiry warnings and missed-run accounting, every 5 minutes.
 * Assumes a single API instance, like SyncRecoveryService. Never throws: a failure is logged and the next tick retries.
 */
@Injectable()
export class AutoSyncSchedulerService {
    private readonly logger = new Logger(AutoSyncSchedulerService.name);
    private ticking = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
        private readonly autoSync: AutoSyncService,
        private readonly pushService: PushService,
        private readonly preferences: NotificationPreferencesService,
    ) {}

    /** Skips the tick while the previous one is still running. */
    @Interval(AUTO_SYNC_TICK_MS)
    async onInterval(): Promise<void> {
        if (this.ticking) return;
        this.ticking = true;
        try {
            await this.tick();
        } catch (err) {
            this.logger.error("Auto-sync scheduler tick failed", err);
        } finally {
            this.ticking = false;
        }
    }

    async tick(now = new Date()): Promise<void> {
        await this.countMissedRuns(now);
        await this.warnExpiringGrants(now);
        await this.runDueGrants(now);
    }

    /** A run token that was never used by its due time counts as a missed run. */
    private async countMissedRuns(now: Date): Promise<void> {
        try {
            await this.prisma.autoSyncGrant.updateMany({
                where: { runTokenHash: { not: null }, runTokenExpiresAt: { lte: now } },
                data: { runTokenHash: null, runTokenExpiresAt: null, missedRuns: { increment: 1 } },
            });
        } catch (err) {
            this.logger.error("Auto-sync missed-run accounting failed", err);
        }
    }

    private async warnExpiringGrants(now: Date): Promise<void> {
        let grants: ExpiringGrant[];
        try {
            grants = await this.prisma.autoSyncGrant.findMany({
                where: {
                    expiryWarnedAt: null,
                    expiresAt: { gt: now, lte: new Date(now.getTime() + AUTO_SYNC_EXPIRY_WARNING_MS) },
                },
                select: { id: true, userId: true, pushSubscriptionId: true, timeZone: true, expiresAt: true },
            });
        } catch (err) {
            this.logger.error("Auto-sync expiry lookup failed", err);
            return;
        }

        for (const grant of grants) {
            try {
                await this.warnExpiring(grant, now);
            } catch (err) {
                this.logger.error(`Auto-sync expiry warning failed for grant ${grant.id}`, err);
            }
        }
    }

    /** Marked warned even when preferences mute the push, so the decision is made once per grant. */
    private async warnExpiring(grant: ExpiringGrant, now: Date): Promise<void> {
        const user = await this.prisma.user.findFirst({
            where: { id: grant.userId, deletedAt: null },
            select: { id: true, role: true },
        });
        if (user && (await this.preferences.shouldSend(user, "auto-sync.expiring"))) {
            const content: NotificationContent = {
                type: "auto-sync.expiring",
                title: `Auto-sync stops on ${formatExpiryDate(grant.expiresAt, grant.timeZone)}`,
                body: "Tap to keep it on.",
                url: AUTO_SYNC_PATH,
                data: { expiresAt: grant.expiresAt.toISOString() },
            };
            await this.pushService.send({ subscriptionId: grant.pushSubscriptionId }, content);
        }

        await this.prisma.autoSyncGrant.updateMany({
            where: { id: grant.id, expiryWarnedAt: null },
            data: { expiryWarnedAt: now },
        });
    }

    private async runDueGrants(now: Date): Promise<void> {
        let dueGrants: DueGrant[];
        let cap: number;
        try {
            const [grants, activeJobs] = await Promise.all([
                this.prisma.autoSyncGrant.findMany({
                    where: { dueAt: { lte: now }, expiresAt: { gt: now } },
                    orderBy: { dueAt: "asc" },
                    select: DUE_GRANT_SELECT,
                }),
                this.prisma.syncJob.count({ where: { status: { in: ["pending", "running"] } } }),
            ]);
            dueGrants = grants;
            cap = bankSyncConcurrency(this.configService) - activeJobs;
        } catch (err) {
            this.logger.error("Auto-sync due-grant lookup failed", err);
            return;
        }

        let pushed = 0;
        for (const grant of dueGrants) {
            try {
                const schedule = this.scheduleOf(grant);
                if (!schedule) {
                    this.logger.error(`Auto-sync grant ${grant.id} has an invalid schedule; skipped`);
                    continue;
                }

                // A sync already in flight for this user covers this run: advance without a push.
                if (await this.hasActiveSyncJob(grant.userId)) {
                    await this.advance(grant, schedule, now);
                    continue;
                }

                // Over the concurrency cap: stop here. This grant and the rest stay due for the next tick.
                if (pushed >= cap) break;

                const { token } = await this.autoSync.issueRunToken(grant.id, now);
                pushed++;
                const results = await this.pushService.send(
                    { subscriptionId: grant.pushSubscriptionId },
                    {
                        type: "auto-sync.run",
                        title: "Syncing your accounts…",
                        body: "",
                        url: AUTO_SYNC_PATH,
                        data: { grantId: grant.id, runToken: token },
                    },
                    {
                        tag: "auto-sync",
                        ttl: autoSyncRunTokenTtlMs(schedule.intervalUnit, schedule.intervalCount) / 1000,
                        urgency: "high",
                    },
                );

                // The device subscription is gone for good, so the grant can never run again: delete it.
                if (results.some((result) => result.outcome === "gone")) {
                    await this.deleteGrant(grant.id);
                    continue;
                }

                await this.advance(grant, schedule, now);
            } catch (err) {
                this.logger.error(`Auto-sync run for grant ${grant.id} failed`, err);
            }
        }
    }

    /** Rebuilds the schedule from the row, or null when the row does not parse. */
    private scheduleOf(grant: DueGrant): AutoSyncSchedule | null {
        if (!isAutoSyncIntervalUnit(grant.intervalUnit)) return null;
        const parsed = parseAutoSyncSchedule({
            intervalUnit: grant.intervalUnit,
            intervalCount: grant.intervalCount,
            windowStartMinute: grant.windowStartMinute,
            windowEndMinute: grant.windowEndMinute,
            runAtMinute: grant.runAtMinute,
        });
        return parsed.ok ? parsed.schedule : null;
    }

    private async hasActiveSyncJob(userId: string): Promise<boolean> {
        const job = await this.prisma.syncJob.findFirst({
            where: { userId, status: { in: ["pending", "running"] } },
            select: { id: true },
        });
        return job !== null;
    }

    private async advance(grant: DueGrant, schedule: AutoSyncSchedule, now: Date): Promise<void> {
        const scheduledRunAt = nextScheduledRunAt(schedule, grant.timeZone, now, grant.scheduledRunAt);
        await this.prisma.autoSyncGrant.updateMany({
            where: { id: grant.id },
            data: { scheduledRunAt, dueAt: jitterRunAt(scheduledRunAt, schedule.intervalUnit) },
        });
    }

    private async deleteGrant(grantId: string): Promise<void> {
        await this.prisma.autoSyncCredential.deleteMany({ where: { grantId } });
        await this.prisma.autoSyncGrant.deleteMany({ where: { id: grantId } });
    }
}
