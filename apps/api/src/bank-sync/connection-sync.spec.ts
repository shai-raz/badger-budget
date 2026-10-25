import { Test } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BankSyncService } from "./bank-sync.service";
import { BankSyncController } from "./bank-sync.controller";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService } from "../crypto/credential-crypto.service";
import { ScraperService } from "./scraper.service";
import { TransactionImportService } from "../transactions/transaction-import.service";
import { AccountBalanceService } from "../accounts/account-balance.service";
import { AccountsService } from "../accounts/accounts.service";

describe("Connection sync", () => {
    const connection = {
        id: "connection-1",
        userId: "user-1",
        isActive: true,
        companyId: "hapoalim",
        displayName: "Bank",
        scrapeLookbackDays: 30,
    };
    const prisma = {
        userSyncSecret: { findUnique: jest.fn() },
        scraperConnection: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
        syncJob: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        scraperJob: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    const crypto = { verifyPin: jest.fn(), decrypt: jest.fn() };
    const scraper = { scrapeConnection: jest.fn() };
    const importer = { importTransactions: jest.fn() };
    let service: BankSyncService;

    beforeEach(async () => {
        jest.resetAllMocks();
        prisma.userSyncSecret.findUnique.mockResolvedValue({});
        prisma.scraperConnection.findFirst.mockResolvedValue(connection);
        prisma.scraperConnection.findMany.mockResolvedValue([connection, { ...connection, id: "connection-2" }]);
        prisma.syncJob.findFirst.mockResolvedValue(null);
        prisma.syncJob.create.mockResolvedValue({ id: "job-1" });
        prisma.scraperJob.create.mockResolvedValue({ id: "child-1" });
        prisma.scraperJob.findMany.mockResolvedValue([{ status: "success" }]);
        crypto.decrypt.mockReturnValue('{"username":"bank-user"}');
        scraper.scrapeConnection.mockResolvedValue({ candidates: [], balances: [] });
        importer.importTransactions.mockResolvedValue({ transactionsSynced: 2, accountsCreated: 0 });
        const module = await Test.createTestingModule({
            providers: [
                BankSyncService,
                { provide: PrismaService, useValue: prisma },
                { provide: CredentialCryptoService, useValue: crypto },
                { provide: ScraperService, useValue: scraper },
                { provide: TransactionImportService, useValue: importer },
                {
                    provide: AccountBalanceService,
                    useValue: { recordBalances: jest.fn().mockResolvedValue({ recorded: 0, accountsCreated: 0 }) },
                },
                { provide: AccountsService, useValue: { upgradeUnknownAccountTypes: jest.fn().mockResolvedValue(0) } },
                { provide: ConfigService, useValue: { get: () => "3" } },
            ],
        }).compile();
        service = module.get(BankSyncService);
    });

    // The runner is intentionally detached; wait until its mocked I/O has settled.
    const finish = () => new Promise<void>((resolve) => setImmediate(resolve));

    it("runs only the requested connection through the existing pipeline", async () => {
        await expect(service.triggerConnectionSync("user-1", connection.id, "1234", "ILS")).resolves.toEqual({
            jobId: "job-1",
        });
        await finish();
        expect(prisma.scraperConnection.findFirst).toHaveBeenCalledWith({
            where: { id: connection.id, userId: "user-1", deletedAt: null },
        });
        expect(prisma.scraperConnection.findMany).not.toHaveBeenCalled();
        expect(prisma.scraperJob.create).toHaveBeenCalledTimes(1);
        expect(prisma.scraperJob.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ scraperConnectionId: connection.id, syncJobId: "job-1" }),
        });
        expect(scraper.scrapeConnection).toHaveBeenCalledWith("hapoalim", { username: "bank-user" }, 30);
        expect(importer.importTransactions).toHaveBeenCalledWith("user-1", [], "ILS");
        expect(prisma.syncJob.update).toHaveBeenLastCalledWith({
            where: { id: "job-1" },
            data: expect.objectContaining({ status: "success", transactionsSynced: 2 }),
        });
    });

    it("still syncs all active connections for a full sync", async () => {
        await service.triggerSync("user-1", "1234");
        await finish();
        expect(prisma.scraperConnection.findMany).toHaveBeenCalledWith({
            where: { userId: "user-1", isActive: true, deletedAt: null },
        });
        expect(scraper.scrapeConnection).toHaveBeenCalledTimes(2);
    });

    it("reports a targeted scrape failure without importing", async () => {
        scraper.scrapeConnection.mockRejectedValue(new Error("Bank unavailable"));
        prisma.scraperJob.findMany.mockResolvedValue([{ status: "failed" }]);
        await service.triggerConnectionSync("user-1", connection.id, "1234");
        await finish();
        expect(importer.importTransactions).not.toHaveBeenCalled();
        expect(prisma.scraperJob.update).toHaveBeenCalledWith({
            where: { id: "child-1" },
            data: expect.objectContaining({ status: "failed", error: "Bank unavailable" }),
        });
        expect(prisma.syncJob.update).toHaveBeenLastCalledWith({
            where: { id: "job-1" },
            data: expect.objectContaining({ status: "failed" }),
        });
    });

    it.each(["missing", "deleted", "another user's"])("rejects a %s connection without creating a job", async () => {
        prisma.scraperConnection.findFirst.mockResolvedValue(null);
        await expect(service.triggerConnectionSync("user-1", connection.id, "1234")).rejects.toThrow(NotFoundException);
        expect(prisma.syncJob.create).not.toHaveBeenCalled();
    });

    it("rejects paused connections", async () => {
        prisma.scraperConnection.findFirst.mockResolvedValue({ ...connection, isActive: false });
        await expect(service.triggerConnectionSync("user-1", connection.id, "1234")).rejects.toThrow(
            BadRequestException,
        );
        expect(prisma.syncJob.create).not.toHaveBeenCalled();
    });

    it("rejects an invalid PIN before looking up the connection", async () => {
        crypto.verifyPin.mockImplementation(() => {
            throw new UnauthorizedException();
        });
        await expect(service.triggerConnectionSync("user-1", connection.id, "wrong")).rejects.toThrow(
            UnauthorizedException,
        );
        expect(prisma.scraperConnection.findFirst).not.toHaveBeenCalled();
    });

    it("requires a configured PIN", async () => {
        prisma.userSyncSecret.findUnique.mockResolvedValue(null);
        await expect(service.triggerConnectionSync("user-1", connection.id, "1234")).rejects.toThrow(
            BadRequestException,
        );
        expect(prisma.syncJob.create).not.toHaveBeenCalled();
    });

    it.each(["pending", "running"])("rejects another sync when a job is %s", async (status) => {
        prisma.syncJob.findFirst.mockResolvedValue({ status });
        await expect(service.triggerConnectionSync("user-1", connection.id, "1234")).rejects.toThrow(ConflictException);
        await expect(service.triggerSync("user-1", "1234")).rejects.toThrow(ConflictException);
        expect(prisma.syncJob.create).not.toHaveBeenCalled();
    });

    it("blocks simultaneous full and targeted starts", async () => {
        const results = await Promise.allSettled([
            service.triggerConnectionSync("user-1", connection.id, "1234"),
            service.triggerSync("user-1", "1234"),
        ]);
        await finish();
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(prisma.syncJob.create).toHaveBeenCalledTimes(1);
    });

    it("forwards the authenticated user and request fields from the endpoint", async () => {
        const trigger = jest.spyOn(service, "triggerConnectionSync").mockResolvedValue({ jobId: "job-1" });
        await new BankSyncController(service).triggerConnectionSync(
            connection.id,
            { pin: "1234", defaultCurrencyCode: "ILS" },
            { id: "user-1" },
        );
        expect(trigger).toHaveBeenCalledWith("user-1", connection.id, "1234", "ILS");
    });
});
