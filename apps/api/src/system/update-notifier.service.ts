import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PushService } from "../notifications/push.service";
import { PrismaService } from "../prisma/prisma.service";
import { InstanceStateService } from "./instance-state.service";
import { LatestRelease, UpdateCheckService } from "./update-check.service";
import { UpgradeService } from "./upgrade.service";
import { SystemService } from "./system.service";
import { buildUpdateAvailableNotification } from "./update-notification";
import { isUpdateAvailable } from "./version";

const LAST_NOTIFIED_KEY = "update-notifier.last-notified-version";
const NOTIFICATION_TTL_SECONDS = 7 * 24 * 60 * 60;

function storedVersion(value: unknown): string | null {
    if (typeof value !== "object" || value === null) return null;
    const version = (value as { version?: unknown }).version;
    return typeof version === "string" ? version : null;
}

/**
 * Tells admins once per newer release. The release is recorded before anything is sent, so a failed push is not
 * retried and a restart never re-sends. Runs off the update check's success listener and never throws.
 *
 * Assumes a single API instance (like SyncRecoveryService). Multiple instances would need a conditional UPDATE to
 * claim the version.
 */
@Injectable()
export class UpdateNotifierService implements OnModuleInit {
    private readonly logger = new Logger(UpdateNotifierService.name);
    /** Serialises notifications so overlapping checks cannot double-send. */
    private chain: Promise<void> = Promise.resolve();

    constructor(
        private readonly updateCheck: UpdateCheckService,
        private readonly system: SystemService,
        private readonly upgrade: UpgradeService,
        private readonly instanceState: InstanceStateService,
        private readonly prisma: PrismaService,
        private readonly push: PushService,
    ) {}

    onModuleInit(): void {
        // Not awaited: the check's caller (an About request or the hourly tick) must not wait on push delivery.
        this.updateCheck.onSuccessfulCheck((latest) => {
            this.enqueue(latest);
        });
    }

    /** Resolves once every queued notification has finished. For tests and shutdown. */
    whenIdle(): Promise<void> {
        return this.chain;
    }

    private enqueue(latest: LatestRelease): void {
        this.chain = this.chain
            .then(() => this.notify(latest))
            .catch((error: unknown) => {
                this.logger.error(
                    `Update notification failed: ${error instanceof Error ? error.message : String(error)}`,
                    error instanceof Error ? error.stack : undefined,
                );
            });
    }

    private async notify(latest: LatestRelease): Promise<void> {
        const running = this.system.getRunningVersion().version;
        if (!isUpdateAvailable(running, latest.version)) return;

        const last = storedVersion(await this.instanceState.get(LAST_NOTIFIED_KEY));
        if (last && !isUpdateAvailable(last, latest.version)) return;

        // Saved before sending: a failed push is not retried, and a restart never re-sends the same release.
        await this.instanceState.set(LAST_NOTIFIED_KEY, { version: latest.version });

        const admins = await this.prisma.user.findMany({
            where: { role: UserRole.ADMIN, deletedAt: null },
            select: { id: true },
        });
        const content = buildUpdateAvailableNotification(latest.version, running, this.upgrade.isConfigured());
        let notified = 0;
        for (const admin of admins) {
            try {
                const results = await this.push.send({ userId: admin.id }, content, { ttl: NOTIFICATION_TTL_SECONDS });
                // send() returns [] for a muted type or no subscriptions, so count only an accepted delivery.
                if (results.some((result) => result.outcome === "accepted")) notified++;
            } catch (error) {
                this.logger.warn(
                    `Update notification to an admin failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
        this.logger.log(`Notified ${notified} of ${admins.length} admin(s) of v${latest.version}`);
    }
}
