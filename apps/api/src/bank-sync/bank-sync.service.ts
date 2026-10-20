import { Injectable, BadRequestException, NotFoundException, ConflictException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService, EncryptedBlob } from "../crypto/credential-crypto.service";
import { CreateScraperConnectionDto } from "./dto/create-scraper-connection.dto";
import { UpdateScraperConnectionDto } from "./dto/update-scraper-connection.dto";
import { RegisterSyncPasskeyDto } from "./dto/register-sync-passkey.dto";
import { ScraperService } from "./scraper.service";
import { TransactionImportService } from "../transactions/transaction-import.service";
import { Prisma, ScraperConnection } from "@prisma/client";
import { mapWithConcurrency } from "./concurrency.util";
import { ImportCandidate } from "../transactions/transaction-import.service";
import { ScrapedAccountBalance } from "./scraped-balance.util";
import { AccountBalanceService } from "../accounts/account-balance.service";
import { AccountsService } from "../accounts/accounts.service";
import { getBalanceKind, getScrapedAccountType, MAX_PASSKEYS } from "@badger/shared-data";

const CONNECTION_SELECT = {
    id: true,
    companyId: true,
    displayName: true,
    scrapeLookbackDays: true,
    isActive: true,
    lastSyncedAt: true,
    createdAt: true,
};

export const SYNC_PASSKEY_SELECT = {
    id: true,
    credentialId: true,
    prfSalt: true,
    wrappedPinCt: true,
    wrappedPinIv: true,
    label: true,
    createdAt: true,
};

const SYNC_JOB_INCLUDE = {
    scraperJobs: { orderBy: { createdAt: "asc" as const } },
};

@Injectable()
export class BankSyncService {
    private readonly logger = new Logger(BankSyncService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly credentialCryptoService: CredentialCryptoService,
        private readonly scraperService: ScraperService,
        private readonly transactionImportService: TransactionImportService,
        private readonly accountBalanceService: AccountBalanceService,
        private readonly accountsService: AccountsService,
        private readonly configService: ConfigService,
    ) {}

    private async verifyUserPin(userId: string, pin: string): Promise<void> {
        const secret = await this.prisma.userSyncSecret.findUnique({ where: { userId } });

        if (!secret) {
            throw new BadRequestException("Set a sync PIN first");
        }

        this.verifyPinAgainst(secret, pin);
    }

    private verifyPinAgainst(
        secret: { verifierCt: string; verifierIv: string; verifierAuthTag: string; kdfSalt: string },
        pin: string,
    ): void {
        const verifierBlob: EncryptedBlob = {
            ciphertext: secret.verifierCt,
            iv: secret.verifierIv,
            authTag: secret.verifierAuthTag,
            salt: secret.kdfSalt,
        };

        this.credentialCryptoService.verifyPin(verifierBlob, pin);
    }

    listPasskeys(userId: string) {
        return this.prisma.syncPasskey.findMany({
            where: { userId },
            select: SYNC_PASSKEY_SELECT,
            orderBy: { createdAt: "asc" },
        });
    }

    async registerPasskey(userId: string, dto: RegisterSyncPasskeyDto) {
        await this.verifyUserPin(userId, dto.pin);

        const count = await this.prisma.syncPasskey.count({ where: { userId } });
        if (count >= MAX_PASSKEYS) {
            throw new BadRequestException(`You can register up to ${MAX_PASSKEYS} sync passkeys`);
        }

        try {
            return await this.prisma.syncPasskey.create({
                data: {
                    userId,
                    credentialId: dto.credentialId,
                    prfSalt: dto.prfSalt,
                    wrappedPinCt: dto.wrappedPinCt,
                    wrappedPinIv: dto.wrappedPinIv,
                    label: dto.label,
                },
                select: SYNC_PASSKEY_SELECT,
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                throw new ConflictException("This passkey is already registered");
            }
            throw error;
        }
    }

    async deletePasskey(userId: string, id: string): Promise<void> {
        const result = await this.prisma.syncPasskey.deleteMany({ where: { id, userId } });
        if (result.count === 0) {
            throw new NotFoundException("Passkey not found");
        }
    }

    async setPinOrChange(userId: string, pin: string): Promise<void> {
        const verifier = this.credentialCryptoService.createVerifier(pin);

        // Passkeys wrap the old PIN, so any PIN change (even to the same value) invalidates them.
        await this.prisma.$transaction(async (tx) => {
            const existing = await tx.userSyncSecret.findUnique({ where: { userId } });

            await tx.userSyncSecret.upsert({
                where: { userId },
                create: {
                    userId,
                    kdfSalt: verifier.salt,
                    verifierCt: verifier.ciphertext,
                    verifierIv: verifier.iv,
                    verifierAuthTag: verifier.authTag,
                },
                update: {
                    kdfSalt: verifier.salt,
                    verifierCt: verifier.ciphertext,
                    verifierIv: verifier.iv,
                    verifierAuthTag: verifier.authTag,
                },
            });

            if (existing) {
                await tx.syncPasskey.deleteMany({ where: { userId } });
            }
        });
    }

    async getSyncPinStatus(userId: string): Promise<{ hasPinSet: boolean }> {
        const secret = await this.prisma.userSyncSecret.findUnique({
            where: { userId },
        });
        return { hasPinSet: !!secret };
    }

    async getConnections(userId: string) {
        return this.prisma.scraperConnection.findMany({
            where: {
                userId,
                deletedAt: null,
            },
            select: CONNECTION_SELECT,
            orderBy: { createdAt: "desc" },
        });
    }

    async createConnection(userId: string, dto: CreateScraperConnectionDto) {
        const secret = await this.prisma.userSyncSecret.findUnique({
            where: { userId },
        });

        if (!secret) {
            // No PIN set yet — register it now from the provided PIN
            const verifier = this.credentialCryptoService.createVerifier(dto.pin);
            await this.prisma.userSyncSecret.create({
                data: {
                    userId,
                    kdfSalt: verifier.salt,
                    verifierCt: verifier.ciphertext,
                    verifierIv: verifier.iv,
                    verifierAuthTag: verifier.authTag,
                },
            });
        } else {
            this.verifyPinAgainst(secret, dto.pin);
        }

        const encrypted = this.credentialCryptoService.encrypt(JSON.stringify(dto.credentials), dto.pin);

        return this.prisma.scraperConnection.create({
            data: {
                userId,
                companyId: dto.companyId,
                displayName: dto.displayName,
                credentialsCt: encrypted.ciphertext,
                credentialsIv: encrypted.iv,
                credentialsAuthTag: encrypted.authTag,
                credentialsSalt: encrypted.salt,
                scrapeLookbackDays: dto.scrapeLookbackDays,
            },
            select: CONNECTION_SELECT,
        });
    }

    async updateConnection(userId: string, id: string, dto: UpdateScraperConnectionDto) {
        const connection = await this.prisma.scraperConnection.findFirst({
            where: { id, userId, deletedAt: null },
        });

        if (!connection) {
            throw new NotFoundException(`ScraperConnection with ID ${id} not found`);
        }

        const hasPinProvided = dto.pin !== undefined;
        const hasCredentialsProvided = dto.credentials !== undefined;

        if (hasPinProvided !== hasCredentialsProvided) {
            throw new BadRequestException("Provide both pin and credentials to re-encrypt");
        }

        const updateData: Record<string, unknown> = {};

        if (dto.displayName !== undefined) {
            updateData.displayName = dto.displayName;
        }
        if (dto.scrapeLookbackDays !== undefined) {
            updateData.scrapeLookbackDays = dto.scrapeLookbackDays;
        }
        if (dto.isActive !== undefined) {
            updateData.isActive = dto.isActive;
        }

        if (hasPinProvided && hasCredentialsProvided) {
            await this.verifyUserPin(userId, dto.pin!);

            const encrypted = this.credentialCryptoService.encrypt(JSON.stringify(dto.credentials!), dto.pin!);
            updateData.credentialsCt = encrypted.ciphertext;
            updateData.credentialsIv = encrypted.iv;
            updateData.credentialsAuthTag = encrypted.authTag;
            updateData.credentialsSalt = encrypted.salt;
        }

        return this.prisma.scraperConnection.update({
            where: { id },
            data: updateData,
            select: CONNECTION_SELECT,
        });
    }

    async deleteConnection(userId: string, id: string): Promise<void> {
        const connection = await this.prisma.scraperConnection.findFirst({
            where: { id, userId, deletedAt: null },
        });

        if (!connection) {
            throw new NotFoundException(`ScraperConnection with ID ${id} not found`);
        }

        await this.prisma.scraperConnection.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    async triggerSync(userId: string, pin: string, defaultCurrencyCode?: string): Promise<{ jobId: string }> {
        // 1. Verify PIN
        await this.verifyUserPin(userId, pin);

        // 2. Block concurrent syncs
        const activeJob = await this.prisma.syncJob.findFirst({
            where: { userId, status: { in: ["pending", "running"] } },
        });
        if (activeJob) throw new ConflictException("A sync is already in progress");

        // 3. Get active connections
        const connections = await this.prisma.scraperConnection.findMany({
            where: { userId, isActive: true, deletedAt: null },
        });
        if (connections.length === 0) throw new BadRequestException("No active scraper connections");

        // 4. Create SyncJob
        const job = await this.prisma.syncJob.create({
            data: { userId, status: "pending" },
        });

        // 5. Run in background (don't await)
        this.runSyncJob(job.id, userId, connections, pin, defaultCurrencyCode).catch((err) =>
            this.logger.error(`Sync job ${job.id} failed`, err),
        );

        return { jobId: job.id };
    }

    private async runSyncJob(
        jobId: string,
        userId: string,
        connections: ScraperConnection[],
        pin: string,
        defaultCurrencyCode?: string,
    ): Promise<void> {
        await this.prisma.syncJob.update({ where: { id: jobId }, data: { status: "running" } });

        // Create a ScraperJob row for each connection (snapshot companyId/displayName)
        const scraperJobIds = new Map<string, string>(); // connectionId → scraperJobId
        for (const conn of connections) {
            const scraperJob = await this.prisma.scraperJob.create({
                data: {
                    syncJobId: jobId,
                    scraperConnectionId: conn.id,
                    companyId: conn.companyId,
                    displayName: conn.displayName,
                    status: "pending",
                },
            });
            scraperJobIds.set(conn.id, scraperJob.id);
        }

        try {
            const concurrency = Math.max(
                1,
                parseInt(this.configService.get<string>("BANK_SYNC_CONCURRENCY", "3"), 10) || 3,
            );

            // Phase 1: parallel scrape (bounded by concurrency cap)
            type ScrapeSuccess = {
                connection: ScraperConnection;
                candidates: ImportCandidate[];
                balances: ScrapedAccountBalance[];
            };
            const scrapeResults = await mapWithConcurrency<ScraperConnection, ScrapeSuccess>(
                connections,
                concurrency,
                async (connection) => {
                    const scraperJobId = scraperJobIds.get(connection.id)!;
                    await this.prisma.scraperJob.update({
                        where: { id: scraperJobId },
                        data: { status: "running", startedAt: new Date() },
                    });

                    const credentials: Record<string, string> = JSON.parse(
                        this.credentialCryptoService.decrypt(
                            {
                                ciphertext: connection.credentialsCt,
                                iv: connection.credentialsIv,
                                authTag: connection.credentialsAuthTag,
                                salt: connection.credentialsSalt,
                            },
                            pin,
                        ),
                    );

                    const { candidates, balances } = await this.scraperService.scrapeConnection(
                        connection.companyId,
                        credentials,
                        connection.scrapeLookbackDays,
                    );

                    return { connection, candidates, balances };
                },
            );

            // Mark failed scrapes immediately
            for (const result of scrapeResults) {
                if (result.ok === false) {
                    const scraperJobId = scraperJobIds.get(result.item.id)!;
                    const errorMessage = result.error instanceof Error ? result.error.message : String(result.error);
                    this.logger.error(`Scrape failed for ${result.item.displayName}: ${errorMessage}`);
                    await this.prisma.scraperJob.update({
                        where: { id: scraperJobId },
                        data: { status: "failed", error: errorMessage, finishedAt: new Date() },
                    });
                }
            }

            // Phase 2: sequential import (preserves DB race-safety)
            const successfulScrapes = scrapeResults.filter((r) => r.ok) as Array<{
                item: ScraperConnection;
                ok: true;
                value: ScrapeSuccess;
            }>;

            let totalTransactions = 0;
            let totalAccounts = 0;

            for (const {
                value: { connection, candidates, balances },
            } of successfulScrapes) {
                const scraperJobId = scraperJobIds.get(connection.id)!;
                try {
                    const result = await this.transactionImportService.importTransactions(
                        userId,
                        candidates,
                        defaultCurrencyCode,
                    );

                    totalTransactions += result.transactionsSynced;
                    totalAccounts += result.accountsCreated;

                    // Balances are secondary to transactions: never let a balance failure flip an
                    // otherwise-successful scraper job to `failed`. Runs after the import so account
                    // rows for transaction-bearing accounts already exist.
                    let accountsSynced = result.accountsCreated;
                    try {
                        const { recorded, accountsCreated } = await this.accountBalanceService.recordBalances(userId, {
                            balances,
                            kind: getBalanceKind(connection.companyId),
                            scraperJobId,
                            defaultCurrencyCode,
                        });
                        totalAccounts += accountsCreated;
                        accountsSynced += accountsCreated;
                        if (recorded > 0) {
                            this.logger.log(`Recorded ${recorded} balance(s) for ${connection.displayName}`);
                        }
                    } catch (balanceError) {
                        const message = (balanceError as Error).message ?? "Unknown error";
                        this.logger.warn(`Balance recording failed for ${connection.displayName}: ${message}`);
                    }

                    // Outside the balance try/catch on purpose: a provider whose balance we can't
                    // interpret still tells us whether its accounts are cards or bank accounts.
                    // Its own try/catch so it can never flip an otherwise-good job to `failed`.
                    // Deliberately not folded into `accountsSynced` — that counter means "accounts
                    // created", and nothing is created here.
                    try {
                        const accountNumbers = [
                            ...new Set(
                                [...candidates.map((c) => c.accountNumber), ...balances.map((b) => b.accountNumber)]
                                    // ImportCandidate.accountNumber can be empty, and an `undefined`
                                    // inside `{ in: [...] }` is a Prisma runtime error.
                                    .filter((n): n is string => typeof n === "string" && n !== ""),
                            ),
                        ];
                        const reclassified = await this.accountsService.upgradeUnknownAccountTypes(
                            userId,
                            accountNumbers,
                            getScrapedAccountType(connection.companyId),
                        );
                        if (reclassified > 0) {
                            this.logger.log(
                                `Classified ${reclassified} previously-unknown account(s) for ${connection.displayName}`,
                            );
                        }
                    } catch (typeError) {
                        const message = (typeError as Error).message ?? "Unknown error";
                        this.logger.warn(
                            `Account type classification failed for ${connection.displayName}: ${message}`,
                        );
                    }

                    await Promise.all([
                        this.prisma.scraperJob.update({
                            where: { id: scraperJobId },
                            data: {
                                status: "success",
                                transactionsSynced: result.transactionsSynced,
                                accountsSynced,
                                finishedAt: new Date(),
                            },
                        }),
                        this.prisma.scraperConnection.update({
                            where: { id: connection.id },
                            data: { lastSyncedAt: new Date() },
                        }),
                    ]);
                } catch (error) {
                    const errorMessage = (error as Error).message ?? "Unknown error";
                    this.logger.error(`Import failed for ${connection.displayName}: ${errorMessage}`);
                    await this.prisma.scraperJob.update({
                        where: { id: scraperJobId },
                        data: { status: "failed", error: errorMessage, finishedAt: new Date() },
                    });
                }
            }

            // Re-read child statuses to compute aggregate accurately
            const childStatuses = await this.prisma.scraperJob.findMany({
                where: { syncJobId: jobId },
                select: { status: true },
            });
            const allFailed = childStatuses.every((s) => s.status === "failed");
            const anyFailed = childStatuses.some((s) => s.status === "failed");
            const overallStatus = allFailed ? "failed" : anyFailed ? "partial" : "success";

            await this.prisma.syncJob.update({
                where: { id: jobId },
                data: {
                    status: overallStatus,
                    transactionsSynced: totalTransactions,
                    accountsSynced: totalAccounts,
                    finishedAt: new Date(),
                },
            });
        } catch (error) {
            // Catastrophic unexpected failure
            await this.prisma.syncJob.update({
                where: { id: jobId },
                data: {
                    status: "failed",
                    error: (error as Error).message ?? "Unknown error",
                    finishedAt: new Date(),
                },
            });
        }
    }

    async getJob(userId: string, jobId: string) {
        const job = await this.prisma.syncJob.findFirst({
            where: { id: jobId, userId },
            include: SYNC_JOB_INCLUDE,
        });
        if (!job) throw new NotFoundException("Job not found");
        return job;
    }

    async getActiveJob(userId: string) {
        return this.prisma.syncJob.findFirst({
            where: { userId, status: { in: ["pending", "running"] } },
            orderBy: { createdAt: "desc" },
            include: SYNC_JOB_INCLUDE,
        });
    }
}
