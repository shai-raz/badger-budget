import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { BankSyncService } from "./bank-sync.service";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService } from "../crypto/credential-crypto.service";
import { ScraperService } from "./scraper.service";
import { TransactionImportService } from "../transactions/transaction-import.service";
import { AccountBalanceService } from "../accounts/account-balance.service";
import { AccountsService } from "../accounts/accounts.service";
import { MAX_PASSKEYS } from "@badger/shared-data";
import { RegisterSyncPasskeyDto } from "./dto/register-sync-passkey.dto";

describe("BankSyncService passkeys", () => {
    let service: BankSyncService;
    let crypto: CredentialCryptoService;

    const userId = "user-1";
    const PIN = "1234";

    const mockPrisma = {
        userSyncSecret: { findUnique: jest.fn(), upsert: jest.fn(), create: jest.fn() },
        scraperConnection: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
        syncJob: { findFirst: jest.fn(), findMany: jest.fn() },
        syncPasskey: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
        $transaction: jest.fn(),
    };

    const mockConfigService = {
        get: jest.fn((key: string) => (key === "CREDENTIAL_ENCRYPTION_PEPPER" ? "test-pepper-value" : undefined)),
    };

    const dto: RegisterSyncPasskeyDto = {
        pin: PIN,
        credentialId: "cred_id-1",
        prfSalt: "A".repeat(43),
        wrappedPinCt: "Y3Q_ct",
        wrappedPinIv: "B".repeat(16),
        label: "My phone",
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BankSyncService,
                CredentialCryptoService,
                { provide: ConfigService, useValue: mockConfigService },
                { provide: PrismaService, useValue: mockPrisma },
                { provide: ScraperService, useValue: {} },
                { provide: TransactionImportService, useValue: {} },
                { provide: AccountBalanceService, useValue: {} },
                { provide: AccountsService, useValue: {} },
            ],
        }).compile();

        service = module.get(BankSyncService);
        crypto = module.get(CredentialCryptoService);

        const v = crypto.createVerifier(PIN);
        mockPrisma.userSyncSecret.findUnique.mockResolvedValue({
            kdfSalt: v.salt,
            verifierCt: v.ciphertext,
            verifierIv: v.iv,
            verifierAuthTag: v.authTag,
        });
        mockPrisma.syncPasskey.count.mockResolvedValue(0);
        mockPrisma.syncPasskey.create.mockResolvedValue({ id: "pk-1" });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("registerPasskey", () => {
        it("rejects a wrong PIN without creating", async () => {
            await expect(service.registerPasskey(userId, { ...dto, pin: "9999" })).rejects.toThrow(
                UnauthorizedException,
            );
            expect(mockPrisma.syncPasskey.create).not.toHaveBeenCalled();
        });

        it("rejects when no sync PIN is set", async () => {
            mockPrisma.userSyncSecret.findUnique.mockResolvedValue(null);
            await expect(service.registerPasskey(userId, dto)).rejects.toThrow(BadRequestException);
            expect(mockPrisma.syncPasskey.create).not.toHaveBeenCalled();
        });

        it("persists exactly the six fields and never the PIN", async () => {
            await service.registerPasskey(userId, dto);

            expect(mockPrisma.syncPasskey.create).toHaveBeenCalledTimes(1);
            const { data } = mockPrisma.syncPasskey.create.mock.calls[0][0];
            expect(data).toEqual({
                userId,
                credentialId: dto.credentialId,
                prfSalt: dto.prfSalt,
                wrappedPinCt: dto.wrappedPinCt,
                wrappedPinIv: dto.wrappedPinIv,
                label: dto.label,
            });
            expect(data).not.toHaveProperty("pin");
            expect(Object.values(data)).not.toContain(PIN);
        });

        it("rejects when the per-user cap is reached", async () => {
            mockPrisma.syncPasskey.count.mockResolvedValue(MAX_PASSKEYS);
            await expect(service.registerPasskey(userId, dto)).rejects.toThrow(BadRequestException);
            expect(mockPrisma.syncPasskey.create).not.toHaveBeenCalled();
        });

        it("maps a unique violation to ConflictException", async () => {
            mockPrisma.syncPasskey.create.mockRejectedValue(
                new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
                    code: "P2002",
                    clientVersion: "test",
                }),
            );
            await expect(service.registerPasskey(userId, dto)).rejects.toThrow(ConflictException);
        });
    });

    describe("setPinOrChange", () => {
        const mockTx = {
            userSyncSecret: { findUnique: jest.fn(), upsert: jest.fn() },
            syncPasskey: { deleteMany: jest.fn() },
        };

        beforeEach(() => {
            mockPrisma.$transaction.mockImplementation((cb: (tx: typeof mockTx) => unknown) => cb(mockTx));
        });

        it("clears only this user's passkeys when a secret already exists", async () => {
            mockTx.userSyncSecret.findUnique.mockResolvedValue({ userId });
            await service.setPinOrChange(userId, "5678");

            expect(mockTx.userSyncSecret.upsert).toHaveBeenCalledTimes(1);
            expect(mockTx.syncPasskey.deleteMany).toHaveBeenCalledTimes(1);
            expect(mockTx.syncPasskey.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
        });

        it("does not delete passkeys on first PIN set", async () => {
            mockTx.userSyncSecret.findUnique.mockResolvedValue(null);
            await service.setPinOrChange(userId, "5678");

            expect(mockTx.userSyncSecret.upsert).toHaveBeenCalledTimes(1);
            expect(mockTx.syncPasskey.deleteMany).not.toHaveBeenCalled();
        });
    });

    describe("listPasskeys", () => {
        it("queries by userId", async () => {
            mockPrisma.syncPasskey.findMany.mockResolvedValue([]);
            await service.listPasskeys(userId);
            expect(mockPrisma.syncPasskey.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId } }),
            );
        });
    });

    describe("deletePasskey", () => {
        it("throws NotFound when nothing was deleted, scoping by id and userId", async () => {
            mockPrisma.syncPasskey.deleteMany.mockResolvedValue({ count: 0 });
            await expect(service.deletePasskey(userId, "pk-1")).rejects.toThrow(NotFoundException);
            expect(mockPrisma.syncPasskey.deleteMany).toHaveBeenCalledWith({ where: { id: "pk-1", userId } });
        });

        it("resolves when a passkey was deleted", async () => {
            mockPrisma.syncPasskey.deleteMany.mockResolvedValue({ count: 1 });
            await expect(service.deletePasskey(userId, "pk-1")).resolves.toBeUndefined();
        });
    });

    describe("PIN verification in connection and sync flows", () => {
        const creds = { username: "u", password: "p" };

        it("triggerSync rejects with 400 when no PIN is set, 401 when wrong", async () => {
            mockPrisma.userSyncSecret.findUnique.mockResolvedValueOnce(null);
            await expect(service.triggerSync(userId, PIN)).rejects.toThrow(BadRequestException);
            await expect(service.triggerSync(userId, "9999")).rejects.toThrow(UnauthorizedException);
            expect(mockPrisma.syncJob.findFirst).not.toHaveBeenCalled();
        });

        it("createConnection registers the PIN on first use without verifying", async () => {
            mockPrisma.userSyncSecret.findUnique.mockResolvedValueOnce(null);
            mockPrisma.userSyncSecret.create.mockResolvedValue({});
            mockPrisma.scraperConnection.create.mockResolvedValue({ id: "c1", scraperJobs: [] });
            await service.createConnection(userId, {
                companyId: "x",
                displayName: "d",
                pin: PIN,
                credentials: creds,
            } as never);
            expect(mockPrisma.userSyncSecret.create).toHaveBeenCalledTimes(1);
            expect(mockPrisma.scraperConnection.create).toHaveBeenCalledTimes(1);
        });

        it("createConnection rejects a wrong PIN when one is already set", async () => {
            await expect(
                service.createConnection(userId, {
                    companyId: "x",
                    displayName: "d",
                    pin: "9999",
                    credentials: creds,
                } as never),
            ).rejects.toThrow(UnauthorizedException);
            expect(mockPrisma.scraperConnection.create).not.toHaveBeenCalled();
        });

        it("updateConnection rejects a wrong PIN when re-encrypting credentials", async () => {
            mockPrisma.scraperConnection.findFirst.mockResolvedValue({ id: "c1", userId });
            await expect(
                service.updateConnection(userId, "c1", { pin: "9999", credentials: creds } as never),
            ).rejects.toThrow(UnauthorizedException);
            expect(mockPrisma.scraperConnection.update).not.toHaveBeenCalled();
        });

        it("updateConnection rejects with 400 when re-encrypting before any sync PIN is set", async () => {
            mockPrisma.scraperConnection.findFirst.mockResolvedValue({ id: "c1", userId });
            mockPrisma.userSyncSecret.findUnique.mockResolvedValueOnce(null);
            const promise = service.updateConnection(userId, "c1", { pin: PIN, credentials: creds } as never);
            await expect(promise).rejects.toThrow(BadRequestException);
            await expect(promise).rejects.toThrow("Set a sync PIN first");
            expect(mockPrisma.scraperConnection.update).not.toHaveBeenCalled();
        });

        it.each([
            ["pin only", { pin: PIN }],
            ["credentials only", { credentials: creds }],
        ])("updateConnection rejects %s before any PIN lookup", async (_label, dto) => {
            mockPrisma.scraperConnection.findFirst.mockResolvedValue({ id: "c1", userId });
            const promise = service.updateConnection(userId, "c1", dto as never);
            await expect(promise).rejects.toThrow(BadRequestException);
            await expect(promise).rejects.toThrow("Provide both pin and credentials to re-encrypt");
            expect(mockPrisma.userSyncSecret.findUnique).not.toHaveBeenCalled();
            expect(mockPrisma.scraperConnection.update).not.toHaveBeenCalled();
        });

        it("createConnection reads the sync secret once when one already exists", async () => {
            mockPrisma.scraperConnection.create.mockResolvedValue({ id: "c1", scraperJobs: [] });
            await service.createConnection(userId, {
                companyId: "x",
                displayName: "d",
                pin: PIN,
                credentials: creds,
            } as never);
            expect(mockPrisma.userSyncSecret.findUnique).toHaveBeenCalledTimes(1);
        });
    });
    describe("getConnections latestJob", () => {
        const finishedAt = new Date("2026-01-02T10:00:00Z");

        it("flattens the latest finished run into latestJob and drops scraperJobs", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValue([
                {
                    id: "c1",
                    displayName: "Bank",
                    scraperJobs: [{ syncJobId: "job-1", status: "failed", errorCode: "INVALID_PASSWORD", finishedAt }],
                },
            ]);

            const [connection] = await service.getConnections(userId);

            expect(connection).not.toHaveProperty("scraperJobs");
            expect(connection.latestJob).toEqual({
                syncJobId: "job-1",
                status: "failed",
                errorCode: "INVALID_PASSWORD",
                finishedAt,
            });
        });

        it("sets latestJob to null when the connection has no finished run", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValue([{ id: "c1", scraperJobs: [] }]);

            const [connection] = await service.getConnections(userId);

            expect(connection.latestJob).toBeNull();
        });

        it("keeps a null errorCode for a successful run", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValue([
                {
                    id: "c1",
                    scraperJobs: [{ syncJobId: "job-1", status: "success", errorCode: null, finishedAt }],
                },
            ]);

            const [connection] = await service.getConnections(userId);

            expect(connection.latestJob?.errorCode).toBeNull();
        });

        it("turns an unknown stored code into UNKNOWN", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValue([
                {
                    id: "c1",
                    scraperJobs: [{ syncJobId: "job-1", status: "failed", errorCode: "NOT_A_CODE", finishedAt }],
                },
            ]);

            const [connection] = await service.getConnections(userId);

            expect(connection.latestJob?.errorCode).toBe("UNKNOWN");
        });

        it("only reads the single latest finished success or failed run", async () => {
            mockPrisma.scraperConnection.findMany.mockResolvedValue([]);

            await service.getConnections(userId);

            const { select } = mockPrisma.scraperConnection.findMany.mock.calls[0][0];
            expect(select.scraperJobs).toEqual(
                expect.objectContaining({
                    where: { finishedAt: { not: null }, status: { in: ["success", "failed"] } },
                    orderBy: { finishedAt: "desc" },
                    take: 1,
                }),
            );
        });
    });

    describe("listJobs", () => {
        const job = (id: string) => ({
            id,
            userId,
            status: "success",
            scraperJobs: [{ id: `${id}-s`, status: "success", errorCode: null }],
        });

        it("filters by userId, newest first, and fetches one row beyond the limit", async () => {
            mockPrisma.syncJob.findMany.mockResolvedValue([]);

            await service.listJobs(userId, { limit: 5 });

            expect(mockPrisma.syncJob.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId },
                    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
                    take: 6,
                }),
            );
            expect(mockPrisma.syncJob.findMany.mock.calls[0][0]).not.toHaveProperty("cursor");
        });

        it("passes the cursor and skips the cursor row itself", async () => {
            mockPrisma.syncJob.findMany.mockResolvedValue([]);

            await service.listJobs(userId, { limit: 5, cursor: "job-9" });

            expect(mockPrisma.syncJob.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 6, cursor: { id: "job-9" }, skip: 1 }),
            );
        });

        it("returns nextCursor from the last kept row when an extra row exists", async () => {
            mockPrisma.syncJob.findMany.mockResolvedValue([job("job-1"), job("job-2"), job("job-3")]);

            const page = await service.listJobs(userId, { limit: 2 });

            expect(page.items.map((j) => j.id)).toEqual(["job-1", "job-2"]);
            expect(page.nextCursor).toBe("job-2");
        });

        it("returns a null nextCursor on the last page", async () => {
            mockPrisma.syncJob.findMany.mockResolvedValue([job("job-1")]);

            const page = await service.listJobs(userId, { limit: 2 });

            expect(page.items.map((j) => j.id)).toEqual(["job-1"]);
            expect(page.nextCursor).toBeNull();
        });

        it("turns an unknown stored scraper errorCode into UNKNOWN", async () => {
            mockPrisma.syncJob.findMany.mockResolvedValue([
                { id: "job-1", scraperJobs: [{ id: "s1", status: "failed", errorCode: "NOT_A_CODE" }] },
            ]);

            const page = await service.listJobs(userId, { limit: 5 });

            expect(page.items[0].scraperJobs[0].errorCode).toBe("UNKNOWN");
        });
    });
});
