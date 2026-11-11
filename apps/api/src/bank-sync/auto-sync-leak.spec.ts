import { randomBytes } from "crypto";
import { inspect } from "util";
import { BadRequestException, HttpException, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import type { ScraperConnection } from "@prisma/client";
import { AutoSyncService } from "./auto-sync.service";
import { BankSyncService } from "./bank-sync.service";
import type { CredentialSource } from "./credential-source";
import { EnableAutoSyncDto } from "./dto/enable-auto-sync.dto";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "../notifications/push.service";
import { NotificationPreferencesService } from "../notifications/notification-preferences.service";
import { CredentialCryptoService } from "../crypto/credential-crypto.service";

// Distinctive values, so a substring match cannot hit by accident.
const PIN = "leak-pin-7531";
const WRONG_PIN = "wrong-pin-0000";
const KEY = randomBytes(32).toString("base64url");
const RUN_TOKEN = randomBytes(32).toString("base64url");
const SECRETS = [PIN, KEY, RUN_TOKEN];
const GRANT_ID = "00000000-0000-4000-8000-0000000000aa";
const PUSH_ID = "00000000-0000-4000-8000-0000000000b1";
const USER_ID = "user-leak";
const NOW = new Date("2026-11-11T10:00:00.000Z");
const DAY = 86_400_000;
const LOGGER_METHODS = ["log", "error", "warn", "debug", "verbose"] as const;
const CONSOLE_METHODS = ["log", "error", "warn", "debug", "info"] as const;

/** Everything a caller sees of a refusal: its stack and message, and any HTTP response body. */
const exposed = (error: unknown): string => {
    const response = error instanceof HttpException ? error.getResponse() : undefined;
    return `${inspect(error, { depth: 10 })} ${inspect(response, { depth: 10 })}`;
};

describe("auto-sync secrets stay out of logs and errors (AC11)", () => {
    let service: AutoSyncService;
    let credentialCrypto: CredentialCryptoService;
    const spies: jest.SpyInstance[] = [];

    const mockPrisma = {
        scraperConnection: { findMany: jest.fn() },
        autoSyncGrant: {
            findUnique: jest.fn(),
            updateMany: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
            deleteMany: jest.fn(),
        },
        autoSyncCredential: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
        pushSubscription: { findFirst: jest.fn() },
        $transaction: jest.fn(),
    };

    const mockBankSync = { verifyUserPin: jest.fn(), startSyncJob: jest.fn() };

    const mockConfigService = {
        get: jest.fn((key: string) => (key === "CREDENTIAL_ENCRYPTION_PEPPER" ? "test-pepper-value" : undefined)),
    };

    const enableDto = (overrides: Partial<EnableAutoSyncDto> = {}): EnableAutoSyncDto =>
        Object.assign(
            new EnableAutoSyncDto(),
            {
                intervalUnit: "hours",
                intervalCount: 4,
                windowStartMinute: 420,
                windowEndMinute: 1320,
                timeZone: "Asia/Jerusalem",
                pin: PIN,
                key: KEY,
                deviceLabel: "Laptop",
                pushSubscriptionId: PUSH_ID,
            },
            overrides,
        );

    /** Everything a logger or console call received, rendered as text. */
    const emitted = (): string =>
        spies
            .flatMap((spy) =>
                spy.mock.calls.map((args: unknown[]) => args.map((arg) => inspect(arg, { depth: 10 })).join(" ")),
            )
            .join("\n");

    const expectClean = (text: string, extra: string[] = []) => {
        for (const secret of [...SECRETS, ...extra]) {
            expect(text).not.toContain(secret);
        }
    };

    beforeEach(async () => {
        jest.resetAllMocks();
        mockConfigService.get.mockImplementation((key: string) =>
            key === "CREDENTIAL_ENCRYPTION_PEPPER" ? "test-pepper-value" : undefined,
        );
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AutoSyncService,
                CredentialCryptoService,
                { provide: ConfigService, useValue: mockConfigService },
                { provide: PrismaService, useValue: mockPrisma },
                { provide: BankSyncService, useValue: mockBankSync },
                { provide: PushService, useValue: { send: jest.fn() } },
                { provide: NotificationPreferencesService, useValue: { shouldSend: jest.fn() } },
            ],
        }).compile();
        service = module.get(AutoSyncService);
        credentialCrypto = module.get(CredentialCryptoService);

        mockBankSync.verifyUserPin.mockImplementation(async (_userId: string, pin: string) => {
            if (pin !== PIN) throw new UnauthorizedException("Invalid PIN");
        });
        mockPrisma.$transaction.mockImplementation((cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma));
        mockPrisma.pushSubscription.findFirst.mockResolvedValue({ id: PUSH_ID });

        for (const method of LOGGER_METHODS) {
            spies.push(jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined));
        }
        for (const method of CONSOLE_METHODS) {
            spies.push(jest.spyOn(console, method).mockImplementation(() => undefined));
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
        spies.length = 0;
    });

    describe("enable", () => {
        it("does not expose the PIN, device key or run token when the PIN is wrong", async () => {
            const error = await service.enable(USER_ID, enableDto({ pin: WRONG_PIN })).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(UnauthorizedException);
            expectClean(exposed(error) + emitted(), [WRONG_PIN]);
        });

        it("does not expose secrets when a saved login cannot be decrypted", async () => {
            const stale = credentialCrypto.encrypt(JSON.stringify({ username: "u", password: "p" }), "other-pin");
            mockPrisma.scraperConnection.findMany.mockResolvedValue([
                {
                    id: "c1",
                    displayName: "Bank One",
                    credentialsCt: stale.ciphertext,
                    credentialsIv: stale.iv,
                    credentialsAuthTag: stale.authTag,
                    credentialsSalt: stale.salt,
                },
            ]);

            const error = await service.enable(USER_ID, enableDto()).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(BadRequestException);
            expectClean(exposed(error) + emitted());
        });
    });

    describe("run", () => {
        const grantKey = () => credentialCrypto.deriveGrantKey(Buffer.from(KEY, "base64url"), GRANT_ID);

        const grantRow = (expiresAt: Date) => {
            const check = credentialCrypto.createGrantKeyCheck(grantKey(), GRANT_ID);
            return {
                id: GRANT_ID,
                userId: USER_ID,
                expiresAt,
                pushSubscriptionId: "00000000-0000-4000-8000-0000000000a1",
                intervalUnit: "hours",
                intervalCount: 4,
                keyCheckCt: check.ciphertext,
                keyCheckIv: check.iv,
                keyCheckAuthTag: check.authTag,
            };
        };

        beforeEach(() => {
            mockPrisma.autoSyncGrant.findUnique.mockResolvedValue(grantRow(new Date(NOW.getTime() + 30 * DAY)));
            mockPrisma.autoSyncGrant.updateMany.mockResolvedValue({ count: 1 });
            mockPrisma.autoSyncCredential.findMany.mockResolvedValue([]);
            mockBankSync.startSyncJob.mockResolvedValue({ jobId: "job-1" });
        });

        it("does not expose the device key when it is wrong", async () => {
            const wrongKey = randomBytes(32).toString("base64url");

            const error = await service
                .run({ grantId: GRANT_ID, key: wrongKey, runToken: RUN_TOKEN }, NOW)
                .catch((e: unknown) => e);

            expect(error).toBeInstanceOf(UnauthorizedException);
            expectClean(exposed(error) + emitted(), [wrongKey]);
        });

        it("does not expose the run token when it is wrong", async () => {
            const wrongToken = randomBytes(32).toString("base64url");
            mockPrisma.autoSyncGrant.updateMany.mockResolvedValue({ count: 0 });

            const error = await service
                .run({ grantId: GRANT_ID, key: KEY, runToken: wrongToken }, NOW)
                .catch((e: unknown) => e);

            expect(error).toBeInstanceOf(UnauthorizedException);
            expectClean(exposed(error) + emitted(), [wrongToken]);
        });

        it("does not expose secrets when the grant has expired", async () => {
            mockPrisma.autoSyncGrant.findUnique.mockResolvedValue(grantRow(new Date(NOW.getTime() - 1000)));

            const error = await service
                .run({ grantId: GRANT_ID, key: KEY, runToken: RUN_TOKEN }, NOW)
                .catch((e: unknown) => e);

            expect(error).toBeInstanceOf(UnauthorizedException);
            expectClean(exposed(error) + emitted());
        });

        it("does not expose secrets when a connection cannot be decrypted during a successful run", async () => {
            const foreign = credentialCrypto.encryptForGrant(
                JSON.stringify({ username: "u", password: "p" }),
                randomBytes(32),
                GRANT_ID,
                "c1",
            );
            mockPrisma.autoSyncCredential.findMany.mockResolvedValue([
                {
                    grantId: GRANT_ID,
                    connectionId: "c1",
                    ...foreign,
                    connection: { id: "c1", displayName: "Bank One", isActive: true, deletedAt: null },
                },
            ]);

            await expect(service.run({ grantId: GRANT_ID, key: KEY, runToken: RUN_TOKEN }, NOW)).resolves.toEqual({
                jobId: "job-1",
            });

            const [, connections, source] = mockBankSync.startSyncJob.mock.calls[0] as [
                string,
                ScraperConnection[],
                CredentialSource,
            ];
            let jobError = "";
            try {
                source.resolve(connections[0]);
            } catch (err) {
                // BankSyncService stores this message as the scraper job error.
                jobError = (err as Error).message;
            }

            expect(jobError).toBe("Auto-sync credentials could not be decrypted");
            expectClean(jobError + emitted());
        });
    });
});
