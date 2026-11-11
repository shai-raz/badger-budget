import { randomBytes, randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
    AUTO_SYNC_KEY_BYTES,
    DEFAULT_AUTO_SYNC_DURATION_DAYS,
    autoSyncRunTokenTtlMs,
    isAutoSyncDurationAllowed,
    isAutoSyncDurationDays,
    isAutoSyncIntervalUnit,
    isCredentialErrorCode,
    type AutoSyncIntervalUnit,
    type AutoSyncSchedule,
    type NotificationContent,
} from "@badger/shared-data";
import type { IAutoSyncStatus } from "@badger/types";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService, GrantDecryptError } from "../crypto/credential-crypto.service";
import { BankSyncService } from "./bank-sync.service";
import type { CredentialSource, SyncJobSummary } from "./credential-source";
import { EnableAutoSyncDto } from "./dto/enable-auto-sync.dto";
import { AutoSyncScheduleDto } from "./dto/auto-sync-schedule.dto";
import { UpdateAutoSyncScheduleDto } from "./dto/update-auto-sync-schedule.dto";
import { canonicalTimeZone, jitterRunAt, nextScheduledRunAt, parseAutoSyncSchedule } from "./auto-sync-schedule";
import { sha256Hex } from "../oauth/oauth-crypto";
import { PushService } from "../notifications/push.service";
import { NotificationPreferencesService } from "../notifications/notification-preferences.service";

/** A grant is shown as unreachable once it has missed this many runs and none has run for this long. */
export const AUTO_SYNC_UNREACHABLE_MISSES = 2;
export const AUTO_SYNC_UNREACHABLE_AFTER_MS = 24 * 3_600_000;

const DAY_MS = 86_400_000;

/** The one refusal every failed run gets, so a caller cannot tell which check failed. */
const runRejected = () => new UnauthorizedException("Auto-sync run rejected");

/** Deletes a grant and its credential copies, for a device whose push subscription is gone for good. */
export async function deleteAutoSyncGrant(prisma: PrismaService, grantId: string): Promise<void> {
    await prisma.autoSyncCredential.deleteMany({ where: { grantId } });
    await prisma.autoSyncGrant.deleteMany({ where: { id: grantId } });
}

const GRANT_STATUS_SELECT = {
    id: true,
    deviceLabel: true,
    intervalUnit: true,
    intervalCount: true,
    windowStartMinute: true,
    windowEndMinute: true,
    runAtMinute: true,
    timeZone: true,
    durationDays: true,
    expiresAt: true,
    scheduledRunAt: true,
    lastRunAt: true,
    missedRuns: true,
    createdAt: true,
};

type GrantStatusRow = {
    id: string;
    deviceLabel: string;
    intervalUnit: string;
    intervalCount: number;
    windowStartMinute: number | null;
    windowEndMinute: number | null;
    runAtMinute: number | null;
    timeZone: string;
    durationDays: number;
    expiresAt: Date;
    scheduledRunAt: Date;
    lastRunAt: Date | null;
    missedRuns: number;
    createdAt: Date;
};

type ConnectionRef = { id: string; displayName: string };

/** The grant fields a run needs to report its result, captured when the run starts. */
type RunGrant = {
    id: string;
    userId: string;
    pushSubscriptionId: string;
    intervalUnit: AutoSyncIntervalUnit;
    intervalCount: number;
};

/** The quiet variant: it shows nothing and only closes the device's "Syncing…" notification. */
function quietResult(summary: SyncJobSummary): NotificationContent {
    return {
        type: "auto-sync.result",
        title: "",
        body: "",
        url: "/",
        data: {
            quiet: true,
            newTransactions: summary.newTransactions,
            failedConnectionCount: summary.failedConnections.length,
        },
    };
}

/** A failure outranks new transactions: one failed connection is named, several are counted. */
function changedResult(summary: SyncJobSummary): NotificationContent {
    const failures = summary.failedConnections;
    const data = {
        quiet: false,
        newTransactions: summary.newTransactions,
        failedConnectionCount: failures.length,
    };
    if (failures.length === 1) {
        return {
            type: "auto-sync.result",
            title: `${failures[0].displayName} didn't sync`,
            body: "Tap for details.",
            url: "/bank-connections",
            data,
        };
    }
    if (failures.length > 1) {
        return {
            type: "auto-sync.result",
            title: `${failures.length} connections didn't sync`,
            body: "Tap for details.",
            url: "/bank-connections",
            data,
        };
    }
    return {
        type: "auto-sync.result",
        title: summary.newTransactions === 1 ? "1 new transaction" : `${summary.newTransactions} new transactions`,
        body: "",
        url: "/transactions",
        data,
    };
}

/** The schedule columns for a parsed schedule; the other unit's columns are null. */
function scheduleColumns(schedule: AutoSyncSchedule) {
    return schedule.intervalUnit === "hours"
        ? {
              windowStartMinute: schedule.windowStartMinute,
              windowEndMinute: schedule.windowEndMinute,
              runAtMinute: null,
          }
        : {
              windowStartMinute: null,
              windowEndMinute: null,
              runAtMinute: schedule.runAtMinute,
          };
}

function toStatus(
    grant: GrantStatusRow,
    included: ConnectionRef[],
    notIncluded: ConnectionRef[],
    now: Date,
): IAutoSyncStatus {
    if (!isAutoSyncIntervalUnit(grant.intervalUnit)) {
        throw new Error(`Auto-sync grant ${grant.id} has an unknown interval unit`);
    }
    if (!isAutoSyncDurationDays(grant.durationDays)) {
        throw new Error(`Auto-sync grant ${grant.id} has an unknown duration`);
    }

    const lastActivity = grant.lastRunAt ?? grant.createdAt;
    const unreachable =
        grant.missedRuns >= AUTO_SYNC_UNREACHABLE_MISSES &&
        now.getTime() - lastActivity.getTime() >= AUTO_SYNC_UNREACHABLE_AFTER_MS;

    return {
        id: grant.id,
        deviceLabel: grant.deviceLabel,
        intervalUnit: grant.intervalUnit,
        intervalCount: grant.intervalCount,
        windowStartMinute: grant.windowStartMinute,
        windowEndMinute: grant.windowEndMinute,
        runAtMinute: grant.runAtMinute,
        timeZone: grant.timeZone,
        durationDays: grant.durationDays,
        expiresAt: grant.expiresAt.toISOString(),
        nextRunAt: grant.scheduledRunAt.toISOString(),
        lastRunAt: grant.lastRunAt ? grant.lastRunAt.toISOString() : null,
        missedRuns: grant.missedRuns,
        unreachable,
        createdAt: grant.createdAt.toISOString(),
        includedConnections: included,
        notIncludedConnections: notIncluded,
    };
}

@Injectable()
export class AutoSyncService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly credentialCryptoService: CredentialCryptoService,
        private readonly bankSyncService: BankSyncService,
        private readonly pushService: PushService,
        private readonly preferences: NotificationPreferencesService,
    ) {}

    /** The live grant, or null when there is none or it has expired. */
    async getStatus(userId: string, now: Date = new Date()): Promise<IAutoSyncStatus | null> {
        const grant = await this.prisma.autoSyncGrant.findFirst({
            where: { userId, expiresAt: { gt: now } },
            select: GRANT_STATUS_SELECT,
        });
        if (!grant) {
            return null;
        }
        return this.buildStatus(userId, grant, now);
    }

    /** Idempotent: deletes the grant and its credential copies, if any. */
    async disable(userId: string): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            await tx.autoSyncCredential.deleteMany({ where: { grant: { userId } } });
            await tx.autoSyncGrant.deleteMany({ where: { userId } });
        });
    }

    /** Validates the schedule; the time zone is returned in canonical form so equal zones store equal strings. */
    private parseSchedule(input: AutoSyncScheduleDto): { schedule: AutoSyncSchedule; timeZone: string } {
        const parsed = parseAutoSyncSchedule(input);
        if (parsed.ok === false) {
            throw new BadRequestException(parsed.message);
        }
        const timeZone = canonicalTimeZone(input.timeZone);
        if (timeZone === null) {
            throw new BadRequestException("Unknown time zone");
        }
        return { schedule: parsed.schedule, timeZone };
    }

    /** Replaces any existing grant: each active connection login is re-encrypted under a key only the device holds. */
    async enable(userId: string, dto: EnableAutoSyncDto, now: Date = new Date()): Promise<IAutoSyncStatus> {
        // Checked before anything else: a grant must have a push subscription that belongs to this user.
        const pushSubscription = await this.prisma.pushSubscription.findFirst({
            where: { id: dto.pushSubscriptionId, userId },
            select: { id: true },
        });
        if (!pushSubscription) {
            throw new BadRequestException("Unknown push subscription");
        }

        const { schedule, timeZone } = this.parseSchedule(dto);
        const durationDays = dto.durationDays ?? DEFAULT_AUTO_SYNC_DURATION_DAYS;
        if (!isAutoSyncDurationAllowed(durationDays, schedule.intervalUnit, schedule.intervalCount)) {
            throw new BadRequestException("Keep auto-sync on for at least two intervals");
        }

        await this.bankSyncService.verifyUserPin(userId, dto.pin);

        const connections = await this.prisma.scraperConnection.findMany({
            where: { userId, isActive: true, deletedAt: null },
            select: {
                id: true,
                displayName: true,
                credentialsCt: true,
                credentialsIv: true,
                credentialsAuthTag: true,
                credentialsSalt: true,
            },
        });
        if (connections.length === 0) {
            throw new BadRequestException("No active scraper connections");
        }

        // Everything is decrypted and re-encrypted before the transaction, so a failure stores nothing.
        const grantId = randomUUID();
        const grantKey = this.credentialCryptoService.deriveGrantKey(Buffer.from(dto.key, "base64url"), grantId);
        const credentialRows = connections.map((connection) => {
            let plaintext: string;
            try {
                plaintext = this.credentialCryptoService.decrypt(
                    {
                        ciphertext: connection.credentialsCt,
                        iv: connection.credentialsIv,
                        authTag: connection.credentialsAuthTag,
                        salt: connection.credentialsSalt,
                    },
                    dto.pin,
                );
            } catch {
                throw new BadRequestException(
                    `Can't read the saved login for "${connection.displayName}". Update its credentials and try again.`,
                );
            }
            return {
                connectionId: connection.id,
                ...this.credentialCryptoService.encryptForGrant(plaintext, grantKey, grantId, connection.id),
            };
        });

        const scheduledRunAt = nextScheduledRunAt(schedule, timeZone, now, null);
        const keyCheck = this.credentialCryptoService.createGrantKeyCheck(grantKey, grantId);

        const grant = await this.prisma.$transaction(async (tx) => {
            await tx.autoSyncCredential.deleteMany({ where: { grant: { userId } } });
            await tx.autoSyncGrant.deleteMany({ where: { userId } });

            const created = await tx.autoSyncGrant.create({
                data: {
                    id: grantId,
                    userId,
                    deviceLabel: dto.deviceLabel,
                    pushSubscriptionId: pushSubscription.id,
                    intervalUnit: schedule.intervalUnit,
                    intervalCount: schedule.intervalCount,
                    ...scheduleColumns(schedule),
                    timeZone,
                    durationDays,
                    expiresAt: new Date(now.getTime() + durationDays * DAY_MS),
                    keyCheckCt: keyCheck.ciphertext,
                    keyCheckIv: keyCheck.iv,
                    keyCheckAuthTag: keyCheck.authTag,
                    scheduledRunAt,
                    dueAt: jitterRunAt(scheduledRunAt, schedule.intervalUnit),
                },
                select: GRANT_STATUS_SELECT,
            });

            await tx.autoSyncCredential.createMany({
                data: credentialRows.map((row) => ({
                    grantId,
                    connectionId: row.connectionId,
                    ciphertext: row.ciphertext,
                    iv: row.iv,
                    authTag: row.authTag,
                })),
            });

            return created;
        });

        return this.buildStatus(userId, grant, now);
    }

    /** Changes the schedule only: no PIN, no duration change, no credential change. */
    async updateSchedule(
        userId: string,
        dto: UpdateAutoSyncScheduleDto,
        now: Date = new Date(),
    ): Promise<IAutoSyncStatus> {
        const existing = await this.prisma.autoSyncGrant.findFirst({
            where: { userId, expiresAt: { gt: now } },
            select: GRANT_STATUS_SELECT,
        });
        if (!existing) {
            throw new NotFoundException("Auto-sync is not on");
        }

        const { schedule, timeZone } = this.parseSchedule(dto);
        const durationDays = existing.durationDays;
        if (
            !isAutoSyncDurationDays(durationDays) ||
            !isAutoSyncDurationAllowed(durationDays, schedule.intervalUnit, schedule.intervalCount)
        ) {
            throw new BadRequestException("Keep auto-sync on for at least two intervals");
        }

        const scheduledRunAt = nextScheduledRunAt(schedule, timeZone, now, null);
        const updated = await this.prisma.autoSyncGrant.update({
            where: { id: existing.id },
            data: {
                intervalUnit: schedule.intervalUnit,
                intervalCount: schedule.intervalCount,
                ...scheduleColumns(schedule),
                timeZone,
                scheduledRunAt,
                dueAt: jitterRunAt(scheduledRunAt, schedule.intervalUnit),
            },
            select: GRANT_STATUS_SELECT,
        });

        return this.buildStatus(userId, updated, now);
    }

    /**
     * Issues the one-time token a scheduled run presents; only its hash is stored. Issuing over a token that was
     * never used counts that token's run as missed.
     */
    async issueRunToken(grantId: string, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
        const grant = await this.prisma.autoSyncGrant.findUnique({
            where: { id: grantId },
            select: { intervalUnit: true, intervalCount: true, runTokenHash: true, expiresAt: true },
        });
        if (!grant || grant.expiresAt.getTime() <= now.getTime()) {
            throw new NotFoundException("Auto-sync is not on");
        }
        if (!isAutoSyncIntervalUnit(grant.intervalUnit)) {
            throw new Error(`Auto-sync grant ${grantId} has an unknown interval unit`);
        }

        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(now.getTime() + autoSyncRunTokenTtlMs(grant.intervalUnit, grant.intervalCount));
        await this.prisma.autoSyncGrant.update({
            where: { id: grantId },
            data: {
                runTokenHash: sha256Hex(token),
                runTokenExpiresAt: expiresAt,
                ...(grant.runTokenHash !== null ? { missedRuns: { increment: 1 } } : {}),
            },
        });
        return { token, expiresAt };
    }

    /**
     * Starts a sync for a grant from its device key and one-time run token. Every refusal is the same 401, so the
     * caller cannot tell which check failed. Once the token is spent, the run counts as done even if the job fails.
     */
    async run(
        input: { grantId: string; key: string; runToken: string },
        now: Date = new Date(),
    ): Promise<{ jobId: string }> {
        const grant = await this.prisma.autoSyncGrant.findUnique({
            where: { id: input.grantId },
            select: {
                id: true,
                userId: true,
                expiresAt: true,
                keyCheckCt: true,
                keyCheckIv: true,
                keyCheckAuthTag: true,
                pushSubscriptionId: true,
                intervalUnit: true,
                intervalCount: true,
            },
        });
        if (!grant || grant.expiresAt.getTime() <= now.getTime()) throw runRejected();

        const deviceKey = Buffer.from(input.key, "base64url");
        if (deviceKey.length !== AUTO_SYNC_KEY_BYTES) throw runRejected();
        const grantKey = this.credentialCryptoService.deriveGrantKey(deviceKey, grant.id);
        const keyCheck = { ciphertext: grant.keyCheckCt, iv: grant.keyCheckIv, authTag: grant.keyCheckAuthTag };
        if (!this.credentialCryptoService.verifyGrantKeyCheck(keyCheck, grantKey, grant.id)) throw runRejected();
        if (!isAutoSyncIntervalUnit(grant.intervalUnit)) {
            throw new Error(`Auto-sync grant ${grant.id} has an unknown interval unit`);
        }
        const runGrant: RunGrant = {
            id: grant.id,
            userId: grant.userId,
            pushSubscriptionId: grant.pushSubscriptionId,
            intervalUnit: grant.intervalUnit,
            intervalCount: grant.intervalCount,
        };

        const rows = await this.prisma.autoSyncCredential.findMany({
            where: { grantId: grant.id, connection: { deletedAt: null, isActive: true } },
            include: { connection: true },
        });

        // The token is spent even when nothing is covered, but only a run that starts a job counts as one.
        const consumed = await this.prisma.autoSyncGrant.updateMany({
            where: {
                id: grant.id,
                runTokenHash: sha256Hex(input.runToken),
                runTokenExpiresAt: { gt: now },
                expiresAt: { gt: now },
            },
            data: {
                runTokenHash: null,
                runTokenExpiresAt: null,
                ...(rows.length > 0 ? { lastRunAt: now, missedRuns: 0 } : {}),
            },
        });
        if (consumed.count !== 1) throw runRejected();
        if (rows.length === 0) throw new BadRequestException("Nothing to sync");

        // Decrypted up front so a renewal during the run cannot break it. grantKey stays inside this closure.
        const credentials = new Map<string, Record<string, string> | GrantDecryptError>();
        for (const row of rows) {
            try {
                const plaintext = this.credentialCryptoService.decryptForGrant(
                    { ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag },
                    grantKey,
                    grant.id,
                    row.connectionId,
                );
                credentials.set(row.connectionId, JSON.parse(plaintext) as Record<string, string>);
            } catch {
                credentials.set(row.connectionId, new GrantDecryptError());
            }
        }

        const source: CredentialSource = {
            resolve(connection) {
                const entry = credentials.get(connection.id) ?? new GrantDecryptError();
                if (entry instanceof GrantDecryptError) throw entry;
                return entry;
            },
            onConnectionFailed: async (connectionId, code) => {
                if (isCredentialErrorCode(code) || code === "CREDENTIALS_UNREADABLE") {
                    await this.prisma.autoSyncCredential.deleteMany({
                        where: { grantId: grant.id, connectionId },
                    });
                }
            },
            onFinished: (summary) => this.sendRunResult(runGrant, summary),
        };

        return this.bankSyncService.startSyncJob(
            grant.userId,
            rows.map((row) => row.connection),
            source,
        );
    }

    /**
     * Pushes a run's result to the device that ran it. A quiet run, or a user who muted results, gets the quiet variant,
     * so "Syncing…" always closes. Sent by subscription id, so the stored preferences are checked here, not by PushService.
     */
    private async sendRunResult(grant: RunGrant, summary: SyncJobSummary): Promise<void> {
        const quiet = summary.newTransactions === 0 && summary.failedConnections.length === 0;
        const content =
            quiet || !(await this.resultsWanted(grant.userId)) ? quietResult(summary) : changedResult(summary);

        const results = await this.pushService.send({ subscriptionId: grant.pushSubscriptionId }, content, {
            tag: "auto-sync",
            ttl: autoSyncRunTokenTtlMs(grant.intervalUnit, grant.intervalCount) / 1000,
        });

        // The device subscription is gone for good, so the grant can never run again: delete it.
        if (results.some((result) => result.outcome === "gone")) {
            await deleteAutoSyncGrant(this.prisma, grant.id);
        }
    }

    private async resultsWanted(userId: string): Promise<boolean> {
        const user = await this.prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: { id: true, role: true },
        });
        return user !== null && (await this.preferences.shouldSend(user, "auto-sync.result"));
    }

    /** Splits the connections into those this grant covers and those it does not (added since, or never). */
    private async buildStatus(userId: string, grant: GrantStatusRow, now: Date): Promise<IAutoSyncStatus> {
        const [credentials, connections] = await Promise.all([
            this.prisma.autoSyncCredential.findMany({
                where: { grantId: grant.id },
                select: { connectionId: true },
            }),
            this.prisma.scraperConnection.findMany({
                where: { userId, deletedAt: null },
                select: { id: true, displayName: true },
                orderBy: { createdAt: "desc" },
            }),
        ]);

        const covered = new Set(credentials.map((credential) => credential.connectionId));
        return toStatus(
            grant,
            connections.filter((connection) => covered.has(connection.id)),
            connections.filter((connection) => !covered.has(connection.id)),
            now,
        );
    }
}
