import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import type { ScraperConnection } from "@prisma/client";
import { BankSyncService } from "./bank-sync.service";
import { CredentialSource, pinCredentialSource } from "./credential-source";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialCryptoService } from "../crypto/credential-crypto.service";
import { ScraperService } from "./scraper.service";
import { TransactionImportService } from "../transactions/transaction-import.service";
import { AccountBalanceService } from "../accounts/account-balance.service";
import { AccountsService } from "../accounts/accounts.service";

const connection = (id: string) =>
    ({
        id,
        userId: "user-1",
        isActive: true,
        companyId: "hapoalim",
        displayName: `Bank ${id}`,
        scrapeLookbackDays: 30,
    }) as unknown as ScraperConnection;

describe("pinCredentialSource", () => {
    const crypto = new CredentialCryptoService({ get: () => "test-pepper" } as unknown as ConfigService);

    const storedAs = (plaintext: string, pin: string) => {
        const blob = crypto.encrypt(plaintext, pin);
        return {
            credentialsCt: blob.ciphertext,
            credentialsIv: blob.iv,
            credentialsAuthTag: blob.authTag,
            credentialsSalt: blob.salt,
        } as unknown as ScraperConnection;
    };

    it("resolves the credentials stored under the same PIN", () => {
        const stored = storedAs(JSON.stringify({ username: "bank-user", password: "pw" }), "1234");

        expect(pinCredentialSource(crypto, "1234").resolve(stored)).toEqual({ username: "bank-user", password: "pw" });
    });

    it("throws for a PIN that did not encrypt the credentials", () => {
        const stored = storedAs(JSON.stringify({ username: "bank-user" }), "1234");

        expect(() => pinCredentialSource(crypto, "9999").resolve(stored)).toThrow(UnauthorizedException);
    });
});

describe("startSyncJob with a credential source", () => {
    const prisma = {
        syncJob: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        scraperConnection: { update: jest.fn() },
        scraperJob: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    };
    const scraper = { scrapeConnection: jest.fn() };
    const importer = { importTransactions: jest.fn() };
    let service: BankSyncService;

    beforeEach(async () => {
        jest.resetAllMocks();
        prisma.syncJob.findFirst.mockResolvedValue(null);
        prisma.syncJob.create.mockResolvedValue({ id: "job-1" });
        prisma.scraperJob.create.mockResolvedValueOnce({ id: "child-A" }).mockResolvedValueOnce({ id: "child-B" });
        prisma.scraperJob.findMany.mockResolvedValue([{ status: "failed" }, { status: "success" }]);
        scraper.scrapeConnection.mockResolvedValue({ candidates: [], balances: [] });
        importer.importTransactions.mockResolvedValue({ transactionsSynced: 0, accountsCreated: 0 });
        const module = await Test.createTestingModule({
            providers: [
                BankSyncService,
                { provide: PrismaService, useValue: prisma },
                { provide: CredentialCryptoService, useValue: {} },
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

    it("fails an unresolvable connection as CREDENTIALS_UNREADABLE and still scrapes the others", async () => {
        const source: CredentialSource = {
            resolve: (conn) => {
                if (conn.id === "A") throw new Error("bad key");
                return { username: "bank-user" };
            },
            onConnectionFailed: jest.fn().mockResolvedValue(undefined),
        };

        await service.startSyncJob("user-1", [connection("A"), connection("B")], source, "ILS");
        await finish();

        expect(prisma.scraperJob.update).toHaveBeenCalledWith({
            where: { id: "child-A" },
            data: expect.objectContaining({ status: "failed", errorCode: "CREDENTIALS_UNREADABLE" }),
        });
        expect(source.onConnectionFailed).toHaveBeenCalledWith("A", "CREDENTIALS_UNREADABLE");
        expect(scraper.scrapeConnection).toHaveBeenCalledTimes(1);
        expect(scraper.scrapeConnection).toHaveBeenCalledWith("hapoalim", { username: "bank-user" }, 30);
    });

    it("reports a scrape failure with its IBS code to onConnectionFailed", async () => {
        scraper.scrapeConnection.mockRejectedValueOnce(
            Object.assign(new Error("wrong password"), { errorType: "INVALID_PASSWORD" }),
        );
        const source: CredentialSource = {
            resolve: () => ({ username: "bank-user" }),
            onConnectionFailed: jest.fn().mockResolvedValue(undefined),
        };

        await service.startSyncJob("user-1", [connection("A")], source, "ILS");
        await finish();

        expect(prisma.scraperJob.update).toHaveBeenCalledWith({
            where: { id: "child-A" },
            data: expect.objectContaining({ status: "failed", errorCode: "INVALID_PASSWORD" }),
        });
        expect(source.onConnectionFailed).toHaveBeenCalledWith("A", "INVALID_PASSWORD");
    });

    it("keeps the run going when onConnectionFailed rejects", async () => {
        const source: CredentialSource = {
            resolve: (conn) => {
                if (conn.id === "A") throw new Error("bad key");
                return { username: "bank-user" };
            },
            onConnectionFailed: jest.fn().mockRejectedValue(new Error("database unavailable")),
        };

        await service.startSyncJob("user-1", [connection("A"), connection("B")], source, "ILS");
        await finish();

        expect(importer.importTransactions).toHaveBeenCalledTimes(1);
        expect(prisma.syncJob.update).toHaveBeenLastCalledWith({
            where: { id: "job-1" },
            data: expect.objectContaining({ status: "partial" }),
        });
    });
});
